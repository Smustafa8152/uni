import { supabase } from '../lib/supabase'
import { createAuthUser } from '../lib/createAuthUser'
import { generateStudentId as generateStudentIdImpl } from './collegeIdFormat'
import { isKuwaitNationality } from './nationalities'

/** @param {number|string} collegeId */
export async function generateStudentId(collegeId) {
  return generateStudentIdImpl(supabase, collegeId)
}

/**
 * Create an invoice retroactively for registration fee paid during application
 * @param {Object} student - The created student object
 * @param {Object} application - The application object with payment information
 */
async function createRegistrationFeeInvoice(student, application) {
  try {
    const { data: existingAppInvoice, error: existingErr } = await supabase
      .from('invoices')
      .select('id')
      .eq('application_id', application.id)
      .maybeSingle()

    if (existingErr && existingErr.code !== 'PGRST116') throw existingErr

    if (existingAppInvoice?.id) {
      await supabase.from('invoices').update({ student_id: student.id }).eq('id', existingAppInvoice.id)
      await supabase.from('payments').update({ student_id: student.id }).eq('invoice_id', existingAppInvoice.id)
      console.log(`✅ Linked application registration invoice ${existingAppInvoice.id} to student ${student.student_id}`)
      return
    }

    // Generate invoice number
    const invoiceNumber = await supabase.rpc('generate_invoice_number', {
      college_id_param: student.college_id
    })

    if (invoiceNumber.error) throw invoiceNumber.error

    const feeAmount = parseFloat(application.registration_fee_amount || 0)
    const paymentDate = application.registration_fee_paid_at ? new Date(application.registration_fee_paid_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]

    // Create invoice for registration fee
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert({
        invoice_number: invoiceNumber.data,
        student_id: student.id,
        college_id: student.college_id,
        invoice_date: paymentDate,
        invoice_type: 'admission_fee', // Registration fees are typically admission fees
        status: 'paid', // Already paid during application
        subtotal: feeAmount,
        discount_amount: 0,
        scholarship_amount: 0,
        tax_amount: 0,
        total_amount: feeAmount,
        paid_amount: feeAmount,
        pending_amount: 0,
        payment_method: application.registration_fee_payment_method || 'online_payment',
        notes: `Registration fee paid during application process (Application #${application.application_number || application.id})`
      })
      .select()
      .single()

    if (invoiceError) throw invoiceError

    // Create invoice item
    const { error: itemError } = await supabase
      .from('invoice_items')
      .insert({
        invoice_id: invoice.id,
        item_type: 'registration_fee',
        item_name_en: 'Registration Fee',
        item_name_ar: 'رسوم التسجيل',
        description: `Registration fee paid during application process`,
        quantity: 1,
        unit_price: feeAmount,
        discount_amount: 0,
        scholarship_amount: 0,
        total_amount: feeAmount,
        reference_id: application.id,
        reference_type: 'application'
      })

    if (itemError) throw itemError

    // Create payment record
    const paymentNumber = await supabase.rpc('generate_payment_number', {
      college_id_param: student.college_id
    })

    if (paymentNumber.error) throw paymentNumber.error

    const { error: paymentError } = await supabase
      .from('payments')
      .insert({
        payment_number: paymentNumber.data,
        invoice_id: invoice.id,
        student_id: student.id,
        college_id: student.college_id,
        payment_date: paymentDate,
        payment_method: application.registration_fee_payment_method || 'online_payment',
        amount: feeAmount,
        status: 'verified', // Already verified when paid during application
        verified_at: application.registration_fee_paid_at || new Date().toISOString(),
        notes: `Registration fee payment from application #${application.application_number || application.id}`
      })

    if (paymentError) throw paymentError

    console.log(`✅ Created registration fee invoice ${invoice.invoice_number} for student ${student.student_id}`)
  } catch (err) {
    console.error('Error creating registration fee invoice:', err)
    throw err
  }
}

/**
 * Switch the applicant login to student. Does not change the password.
 * Staff session required: the database function checks the caller.
 */
async function promoteApplicantLogin(application, customPassword, name) {
  const { data, error } = await supabase.rpc('promote_applicant_to_student', {
    p_email: application.email,
    p_college_id: application.college_id ?? null,
    p_applicant_auth_id: application.applicant_user_id ? String(application.applicant_user_id) : null,
  })

  if (!error && data?.promoted) return { ok: true }

  if (!error && data?.reason === 'no_user' && customPassword) {
    await createAuthUser({
      email: application.email,
      password: customPassword,
      role: 'student',
      college_id: application.college_id,
      name,
    })
    return { ok: true }
  }

  return {
    ok: false,
    error: error?.message || data?.reason || 'Could not promote the applicant login',
  }
}

async function attachApplicationRecords(student, application) {
  if (application.registration_fee_amount && application.registration_fee_paid_at) {
    try {
      await createRegistrationFeeInvoice(student, application)
    } catch (invoiceError) {
      console.error('Error creating registration fee invoice:', invoiceError)
    }
  }

  try {
    const { data: appDocs, error: appDocsError } = await supabase
      .from('application_documents')
      .select('document_type, file_path, file_name, file_size, content_type, uploaded_at, verified_at')
      .eq('application_id', application.id)
    if (!appDocsError && appDocs && appDocs.length > 0) {
      for (const doc of appDocs) {
        await supabase.from('student_documents').upsert(
          {
            student_id: student.id,
            document_type: doc.document_type,
            file_path: doc.file_path,
            file_name: doc.file_name,
            file_size: doc.file_size,
            content_type: doc.content_type,
            uploaded_at: doc.uploaded_at || new Date().toISOString(),
            status: doc.verified_at ? 'verified' : 'in_review',
            verified_at: doc.verified_at || null,
          },
          { onConflict: 'student_id,document_type' }
        )
      }
    }
  } catch (docsErr) {
    console.error('Error copying application documents to student:', docsErr)
  }
}

/**
 * Create a student record from an application
 * This function handles the complete student creation process including:
 * - Student ID generation
 * - Student record creation
 * - Linking the existing applicant login (same email and password)
 * - Registration fee invoice creation (if fee was paid during application)
 * Safe to run again: an existing student for this email is kept and the login is promoted.
 * @param {Object} application - The application object
 * @param {string} [customPassword] - Optional custom password for the auth user account
 */
export async function createStudentFromApplication(application, customPassword = null) {
  try {
    // Check if student already exists for this application
    const { data: existingStudent, error: checkError } = await supabase
      .from('students')
      .select('id, student_id, email')
      .eq('email', application.email)
      .maybeSingle()

    if (checkError && checkError.code !== 'PGRST116') {
      throw new Error(`Error checking existing student: ${checkError.message}`)
    }

    if (existingStudent) {
      const name = [application.first_name, application.middle_name, application.last_name].filter(Boolean).join(' ')
      const promoted = await promoteApplicantLogin(application, customPassword, name)
      await attachApplicationRecords(existingStudent, application)
      return {
        success: promoted.ok,
        error: promoted.ok ? undefined : promoted.error,
        student: existingStudent,
        alreadyExists: true,
        promoted: promoted.ok,
      }
    }

    if (!application.college_id) {
      throw new Error('Application must have a college_id')
    }

    if (!application.major_id) {
      throw new Error('Application must have a major_id')
    }

    // Generate student ID
    const studentId = await generateStudentId(application.college_id)
    if (!studentId) {
      throw new Error('Failed to generate student ID')
    }

    // Construct name_en and name_ar from first/middle/last names
    const name_en = [application.first_name, application.middle_name, application.last_name]
      .filter(Boolean).join(' ')
    const name_ar = [application.first_name_ar, application.middle_name_ar, application.last_name_ar]
      .filter(Boolean).join(' ')

    // Map application fields to student fields
    // Use enrollment_date from application or default to current date
    // enrollment_date is required in students table, so we must always provide a value
    const enrollmentDate = application.enrollment_date || new Date().toISOString().split('T')[0]

    // Retry logic for duplicate key errors
    let insertAttempts = 0
    const maxInsertAttempts = 5
    let insertSuccess = false
    let lastError = null
    let currentStudentId = studentId

    while (insertAttempts < maxInsertAttempts && !insertSuccess) {
      const studentData = {
        student_id: currentStudentId,
        first_name: application.first_name,
        middle_name: application.middle_name || null,
        last_name: application.last_name,
        name_en: name_en || application.first_name + ' ' + application.last_name,
        name_ar: name_ar || (application.first_name_ar && application.last_name_ar 
          ? application.first_name_ar + ' ' + application.last_name_ar 
          : null),
        first_name_ar: application.first_name_ar || null,
        middle_name_ar: application.middle_name_ar || null,
        last_name_ar: application.last_name_ar || null,
        email: application.email,
        phone: application.phone || null,
        mobile_phone: application.phone || null, // Use phone as mobile if available
        date_of_birth: application.date_of_birth || null,
        gender: application.gender || null,
        nationality: application.nationality || null,
        religion: application.religion || null,
        marital_status: null, // Not in application
        blood_type: null, // Not in application
        is_international: application.nationality ? !isKuwaitNationality(application.nationality) : false,
        address: application.street_address || application.address || null,
        city: application.city || null,
        state: application.state_province || application.state || null,
        country: application.country || null,
        postal_code: application.postal_code || null,
        major_id: parseInt(application.major_id),
        college_id: parseInt(application.college_id),
        enrollment_date: enrollmentDate,
        study_type: application.study_type === 'part_time' ? 'part_time' : 'full_time',
        study_load: 'normal', // Default
        study_approach: application.study_type === 'online' ? 'online' : 'on_campus',
        credit_hours: null, // Will be determined by enrollment
        emergency_contact_name: application.emergency_contact_name || null,
        emergency_contact_relation: application.emergency_contact_relationship || application.emergency_contact_relation || null,
        emergency_phone: application.emergency_contact_phone || application.emergency_phone || null,
        emergency_contact_email: application.emergency_contact_email || null,
        national_id: application.id_number || null,
        passport_number: application.id_type === 'passport' ? application.id_number || null : null,
        passport_expiry: application.id_type === 'passport' ? application.id_expiry_date || null : null,
        visa_number: null,
        visa_expiry: null,
        residence_permit_number: null,
        residence_permit_expiry: null,
        high_school_name: application.high_school_name || null,
        high_school_country: application.high_school_country || null,
        graduation_year: application.graduation_year ? parseInt(application.graduation_year) : null,
        high_school_gpa: application.gpa ? parseFloat(application.gpa) : null,
        has_scholarship: application.scholarship_request || false,
        scholarship_type: application.scholarship_type?.trim() || null,
        scholarship_percentage: application.scholarship_percentage ? parseFloat(application.scholarship_percentage) : null,
        scholarship_details: application.scholarship_details?.trim() || null,
        medical_conditions: null, // Not in application
        allergies: null, // Not in application
        medications: null, // Not in application
        documents: null, // Documents are stored separately in applications
        notes: `Created from application #${application.application_number || application.id}`,
        status: 'active',
        current_status_code: 'ENAC',
      }

      const { data: createdStudent, error: insertError } = await supabase
        .from('students')
        .insert(studentData)
        .select()
        .single()

      // Check if error is a duplicate key error
      if (insertError) {
        // If it's a duplicate key error (23505), generate a new ID and retry
        if (insertError.code === '23505' && insertError.message?.includes('student_id')) {
          console.warn(`Duplicate student_id detected: ${currentStudentId}. Generating new ID...`)
          insertAttempts++
          // Generate a new student ID
          const newStudentId = await generateStudentId(application.college_id)
          if (newStudentId && newStudentId !== currentStudentId) {
            currentStudentId = newStudentId
            continue // Retry with new ID
          } else {
            lastError = insertError
            break // Can't generate new ID, break and throw error
          }
        } else {
          // For other errors, throw immediately
          throw insertError
        }
      } else {
        // Success! Break out of retry loop
        insertSuccess = true

        const promoted = await promoteApplicantLogin(application, customPassword, name_en)
        await attachApplicationRecords(createdStudent, application)

        return {
          success: promoted.ok,
          error: promoted.ok ? undefined : promoted.error,
          student: createdStudent,
          alreadyExists: false,
          promoted: promoted.ok,
        }
      }
    }

    // If we exhausted retry attempts, throw the last error
    if (!insertSuccess && lastError) {
      throw lastError
    }
    
    // If we exhausted retry attempts without an error, throw generic error
    if (!insertSuccess) {
      throw new Error('Failed to create student after multiple attempts due to duplicate student ID conflicts')
    }
  } catch (err) {
    console.error('Error creating student from application:', err)
    return {
      success: false,
      error: err.message || 'Failed to create student from application',
      alreadyExists: false
    }
  }
}

