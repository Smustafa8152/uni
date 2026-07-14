import { BrowserRouter, Routes, Route, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { CollegeProvider } from './contexts/CollegeContext'
import { LanguageProvider } from './contexts/LanguageContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import './i18n'
import Layout from './components/Layout'
import RoleBasedLayout from './components/RoleBasedLayout'
import Landing from './pages/Landing'
import LoginAdmin from './pages/LoginAdmin'
import LoginCollege from './pages/LoginCollege'
import LoginInstructor from './pages/LoginInstructor'
import LoginStudent from './pages/LoginStudent'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import Students from './pages/Students'
import CreateStudent from './pages/CreateStudent'
import UploadStudents from './pages/UploadStudents'
import Instructors from './pages/Instructors'
import Courses from './pages/Courses'
import Schedule from './pages/Schedule'
import Examinations from './pages/Examinations'
import Settings from './pages/Settings'
import Colleges from './pages/admin/Colleges'
import CreateCollege from './pages/admin/CreateCollege'
import ViewCollege from './pages/admin/ViewCollege'
import CollegeProfile from './pages/admin/CollegeProfile'
import CollegeKPIs from './pages/admin/CollegeKPIs'
import RequestsManagement from './pages/admin/RequestsManagement'
import CreateInstructor from './pages/CreateInstructor'
import CreateAcademicYear from './pages/academic/CreateAcademicYear'
import CreateSemester from './pages/academic/CreateSemester'
import CreateDepartment from './pages/academic/CreateDepartment'
import CreateMajor from './pages/academic/CreateMajor'
import CreateSubject from './pages/academic/CreateSubject'
import CreateClass from './pages/academic/CreateClass'
import AcademicYears from './pages/academic/AcademicYears'
import Semesters from './pages/academic/Semesters'
import Departments from './pages/academic/Departments'
import Majors from './pages/academic/Majors'
import Subjects from './pages/academic/Subjects'
import Classes from './pages/academic/Classes'
import ViewAcademicYear from './pages/academic/ViewAcademicYear'
import EditAcademicYear from './pages/academic/EditAcademicYear'
import ViewSemester from './pages/academic/ViewSemester'
import EditSemester from './pages/academic/EditSemester'
import ViewDepartment from './pages/academic/ViewDepartment'
import EditDepartment from './pages/academic/EditDepartment'
import ViewMajor from './pages/academic/ViewMajor'
import EditMajor from './pages/academic/EditMajor'
import ManageMajorSheet from './pages/academic/ManageMajorSheet'
import ViewSubject from './pages/academic/ViewSubject'
import EditSubject from './pages/academic/EditSubject'
import ViewClass from './pages/academic/ViewClass'
import EditClass from './pages/academic/EditClass'
import ViewInstructor from './pages/ViewInstructor'
import ViewStudent from './pages/ViewStudent'
import EditStudent from './pages/EditStudent'
import AttendanceDashboard from './pages/attendance/AttendanceDashboard'
import ClassSessions from './pages/attendance/ClassSessions'
import TakeAttendance from './pages/attendance/TakeAttendance'
import CreateSession from './pages/attendance/CreateSession'
import Enrollments from './pages/Enrollments'
import CreateEnrollment from './pages/CreateEnrollment'
import ViewEnrollment from './pages/ViewEnrollment'
import BulkEnrollment from './pages/BulkEnrollment'
import CreateExamination from './pages/examinations/CreateExamination'
import ExaminationDashboard from './pages/examinations/ExaminationDashboard'
import ExaminationStatistics from './pages/examinations/ExaminationStatistics'
import ExaminationConflicts from './pages/examinations/ExaminationConflicts'
import Applications from './pages/admissions/Applications'
import CreateApplication from './pages/admissions/CreateApplication'
import ViewApplication from './pages/admissions/ViewApplication'
import UniversitySettings from './pages/admin/UniversitySettings'
import AdminCurriculumMap from './pages/admin/AdminCurriculumMap'
import AdminBuildLesson from './pages/admin/AdminBuildLesson'
import AdminRubricBuilder from './pages/admin/AdminRubricBuilder'
import AdminELibrary from './pages/admin/AdminELibrary'
import GradeManagement from './pages/grading/GradeManagement'
import ClassGrades from './pages/grading/ClassGrades'
import StudentGrades from './pages/grading/StudentGrades'
import Transcripts from './pages/grading/Transcripts'
import GradeAnalytics from './pages/grading/GradeAnalytics'
import StudentMyGrades from './pages/student/StudentMyGrades'
import StudentMyAttendance from './pages/student/StudentMyAttendance'
import StudentPayments from './pages/student/StudentPayments'
import StudentSubjectView from './pages/student/StudentSubjectView'
import StudentEnrollment from './pages/student/StudentEnrollment'
import StudentProfile from './pages/student/StudentProfile'
import StudentSchedule from './pages/student/StudentSchedule'
import StudentGraduationPath from './pages/student/StudentGraduationPath'
import StudentCourseGuide from './pages/student/StudentCourseGuide'
import StudentCourseCatalog from './pages/student/StudentCourseCatalog'
import StudentHolds from './pages/student/StudentHolds'
import StudentPaymentReceipt from './pages/student/StudentPaymentReceipt'
import StudentComingSoon from './pages/student/StudentComingSoon'
import StudentDocuments from './pages/student/StudentDocuments'
import StudentRequestsCenter from './pages/student/StudentRequestsCenter'
import StudentRequestDetail from './pages/student/StudentRequestDetail'
import StudentTeamsSessions from './pages/student/StudentTeamsSessions'
import StudentSessionLobby from './pages/student/StudentSessionLobby'
import StudentSessionHistory from './pages/student/StudentSessionHistory'
import StudentCourseware from './pages/student/StudentCourseware'
import StudentLessonViewer from './pages/student/StudentLessonViewer'
import StudentELearningExams from './pages/student/StudentELearningExams'
import StudentExamRoom from './pages/student/StudentExamRoom'
import StudentExamSubmitted from './pages/student/StudentExamSubmitted'
import StudentELibrary from './pages/student/StudentELibrary'
import StudentLearningProgress from './pages/student/StudentLearningProgress'
import StudentStudyPlanner from './pages/student/StudentStudyPlanner'
import InstructorSubjectView from './pages/instructor/InstructorSubjectView'
import InstructorDashboard from './pages/instructor/InstructorDashboard'
import InstructorMyCourses from './pages/instructor/InstructorMyCourses'
import InstructorCourseAnalytics from './pages/instructor/InstructorCourseAnalytics'
import InstructorCommunication from './pages/instructor/InstructorCommunication'
import InstructorIntegrityCases from './pages/instructor/InstructorIntegrityCases'
import InstructorWorkload from './pages/instructor/InstructorWorkload'
import InstructorReports from './pages/instructor/InstructorReports'
import InstructorExamPagePreview from './pages/instructor/InstructorExamPagePreview'
import InstructorExamSettings from './pages/instructor/InstructorExamSettings'
import InstructorCurriculumMap from './pages/instructor/InstructorCurriculumMap'
import InstructorBuildLesson from './pages/instructor/InstructorBuildLesson'
import InstructorLessonPreview from './pages/instructor/InstructorLessonPreview'
import InstructorContentRelease from './pages/instructor/InstructorContentRelease'
import InstructorAssessmentAuthoring from './pages/instructor/InstructorAssessmentAuthoring'
import InstructorQuestionBank from './pages/instructor/InstructorQuestionBank'
import InstructorGradebook from './pages/instructor/InstructorGradebook'
import InstructorExamMonitor from './pages/instructor/InstructorExamMonitor'
import InstructorManualGrading from './pages/instructor/InstructorManualGrading'
import InstructorComingSoon from './pages/instructor/InstructorComingSoon'
import InstructorTemplates from './pages/instructor/InstructorTemplates'
import CreateMaterial from './pages/instructor/CreateMaterial'
import EditMaterial from './pages/instructor/EditMaterial'
import CreateHomework from './pages/instructor/CreateHomework'
import EditHomework from './pages/instructor/EditHomework'
import CreateExam from './pages/instructor/CreateExam'
import InvoiceManagement from './pages/finance/InvoiceManagement'
import CreateInvoice from './pages/finance/CreateInvoice'
import ViewInvoice from './pages/finance/ViewInvoice'
import CreditWallet from './pages/finance/CreditWallet'
import FinanceReports from './pages/finance/FinanceReports'
import Donations from './pages/finance/Donations'
import CreateDonation from './pages/finance/CreateDonation'
import InstallmentPlans from './pages/finance/InstallmentPlans'
import CreateInstallmentPlan from './pages/finance/CreateInstallmentPlan'
import FinanceConfiguration from './pages/finance/FinanceConfiguration'
import CreateFeeStructure from './pages/finance/CreateFeeStructure'
import CreateFeeType from './pages/finance/CreateFeeType'
import RegisterApplication from './pages/public/RegisterApplication'
import TrackApplication from './pages/public/TrackApplication'
import ApplicationStatus from './pages/public/ApplicationStatus'
import { ApplicantProtectedRoute } from './components/ApplicantProtectedRoute'
import ApplicantPortalLayout from './pages/applicant/ApplicantPortalLayout'
import ApplicantDashboard from './pages/applicant/ApplicantDashboard'
import ApplicantSelectMajor from './pages/applicant/ApplicantSelectMajor'
import ApplicantProfile from './pages/applicant/ApplicantProfile'
import ApplicantRegister from './pages/applicant/ApplicantRegister'
import LoginApplicant from './pages/applicant/LoginApplicant'
import ApplicantApplicationStatusPage from './pages/applicant/ApplicantApplicationStatusPage'
import ApplicantOfferLetter from './pages/applicant/ApplicantOfferLetter'
import ApplicantOfferLetterIndex from './pages/applicant/ApplicantOfferLetterIndex'
import AdminRequestDetail from './pages/admin/RequestDetail'

/** Old bookmarked URLs: /track/:id → /application-status/:id */
function LegacyTrackIdRedirect() {
  const { id } = useParams()
  return <Navigate to={`/application-status/${id}`} replace />
}

function GradeSubmissionRedirect() {
  const [searchParams] = useSearchParams()
  const classId = searchParams.get('classId')
  const to = classId
    ? `/instructor/gradebook?classId=${classId}&panel=submit`
    : '/instructor/gradebook?panel=submit'
  return <Navigate to={to} replace />
}

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <CollegeProvider>
          <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login/admin" element={<LoginAdmin />} />
          <Route path="/login/college" element={<LoginCollege />} />
          <Route path="/login/instructor" element={<LoginInstructor />} />
          <Route path="/login/student" element={<LoginStudent />} />
          <Route path="/signup" element={<Signup />} />
          {/* Applicant portal (pre-enrollment): register with email OTP + password, then dashboard / apply */}
          <Route path="/register" element={<ApplicantRegister />} />
          <Route path="/login/applicant" element={<LoginApplicant />} />
          <Route
            path="/portal"
            element={
              <ApplicantProtectedRoute>
                <ApplicantPortalLayout />
              </ApplicantProtectedRoute>
            }
          >
            <Route index element={<ApplicantDashboard />} />
            <Route path="apply" element={<ApplicantSelectMajor />} />
            <Route path="apply/new" element={<RegisterApplication portal />} />
            <Route path="profile" element={<ApplicantProfile />} />
            <Route path="applications/:id" element={<ApplicationStatus />} />
            <Route path="applications/:id/offer-letter" element={<ApplicantOfferLetter />} />
            <Route path="offer-letter" element={<ApplicantOfferLetterIndex />} />
          </Route>
          <Route
            path="/application-status"
            element={
              <ApplicantProtectedRoute>
                <ApplicantPortalLayout />
              </ApplicantProtectedRoute>
            }
          >
            <Route index element={<ApplicantApplicationStatusPage />} />
          </Route>
          <Route path="/lookup-application" element={<TrackApplication />} />
          <Route path="/application-status/:id" element={<ApplicationStatus />} />
          <Route path="/track" element={<Navigate to="/lookup-application" replace />} />
          <Route path="/track/:id" element={<LegacyTrackIdRedirect />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <Dashboard />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/students"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <Students />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/students/create"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <CreateStudent />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/students/upload"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <UploadStudents />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructors"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <Instructors />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/enrollments"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <Enrollments />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/enrollments/create"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <CreateEnrollment />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/enrollments/:id"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <ViewEnrollment />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/enrollments/bulk"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <BulkEnrollment />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/courses"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <Courses />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/schedule"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <Schedule />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/examinations"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <Examinations />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/examinations/dashboard"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <ExaminationDashboard />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/examinations/statistics"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <ExaminationStatistics />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/examinations/conflicts"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <ExaminationConflicts />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/examinations/create"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <CreateExamination />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admissions/applications"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <Applications />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admissions/applications/create"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <CreateApplication />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admissions/applications/:id"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <ViewApplication />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <Settings />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/requests"
            element={
              <ProtectedRoute allowedRoles={['admin', 'user']}>
                <RoleBasedLayout>
                  <RequestsManagement />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/requests/:id"
            element={
              <ProtectedRoute allowedRoles={['admin', 'user']}>
                <RoleBasedLayout>
                  <AdminRequestDetail />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/attendance"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <AttendanceDashboard />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/attendance/sessions"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <ClassSessions />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/attendance/take"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <TakeAttendance />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/attendance/sessions/create"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <CreateSession />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/colleges"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <Colleges />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/colleges/create"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <CreateCollege />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/university-settings"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <UniversitySettings />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/curriculum-map"
            element={
              <ProtectedRoute allowedRoles={['admin', 'user']}>
                <RoleBasedLayout>
                  <AdminCurriculumMap />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/build-lessons"
            element={
              <ProtectedRoute allowedRoles={['admin', 'user']}>
                <Navigate to="/academic/classes/build-lessons" replace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/rubric-builder"
            element={
              <ProtectedRoute allowedRoles={['admin', 'user']}>
                <RoleBasedLayout>
                  <AdminRubricBuilder />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/elibrary"
            element={
              <ProtectedRoute allowedRoles={['admin', 'user']}>
                <RoleBasedLayout>
                  <AdminELibrary />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/colleges/:id/edit"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <CreateCollege />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/colleges/:id"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <CollegeProfile />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/colleges/:id/kpis"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <CollegeKPIs />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/college/kpis"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <CollegeKPIs />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructors/create"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <CreateInstructor />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/academic/years/create"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <CreateAcademicYear />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/academic/semesters/create"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <CreateSemester />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/academic/departments/create"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <CreateDepartment />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/academic/majors/create"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <CreateMajor />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/academic/subjects/create"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <CreateSubject />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/academic/classes/create"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <CreateClass />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/academic/years"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <AcademicYears />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/academic/semesters"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <Semesters />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/academic/departments"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <Departments />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/academic/majors"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <Majors />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/academic/subjects"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <Subjects />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/academic/classes"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <Classes />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/academic/classes/build-lessons"
            element={
              <ProtectedRoute allowedRoles={['admin', 'user']}>
                <RoleBasedLayout>
                  <AdminBuildLesson />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/academic/years/:id"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <ViewAcademicYear />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/academic/years/:id/edit"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <EditAcademicYear />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/academic/semesters/:id"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <ViewSemester />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/academic/semesters/:id/edit"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <EditSemester />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/academic/departments/:id"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <ViewDepartment />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/academic/departments/:id/edit"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <EditDepartment />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/academic/majors/:id"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <ViewMajor />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/academic/majors/:id/edit"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <EditMajor />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/academic/majors/:id/degree-plan"
            element={
              <ProtectedRoute allowedRoles={['admin', 'user']}>
                <RoleBasedLayout>
                  <ManageMajorSheet />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/academic/subjects/:id"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <ViewSubject />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/academic/subjects/:id/edit"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <EditSubject />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/academic/classes/:id"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <ViewClass />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/academic/classes/:id/edit"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <EditClass />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructors/:id"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <ViewInstructor />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructors/:id/edit"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <CreateInstructor />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/students/:id"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <ViewStudent />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/students/:id/edit"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <EditStudent />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/grading"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <GradeManagement />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/grading/classes/:classId/grades"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <ClassGrades />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/grading/students"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <StudentGrades />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/grading/students/:studentId/report"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <Transcripts />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/grading/transcripts"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <Transcripts />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/grading/analytics"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <GradeAnalytics />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          {/* Student Pages */}
          <Route
            path="/student/grades"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <StudentMyGrades />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/attendance"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <StudentMyAttendance />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/subjects/:id"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <StudentSubjectView />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/payments"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <RoleBasedLayout>
                  <StudentPayments />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/payments/receipt/:paymentId"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <RoleBasedLayout>
                  <StudentPaymentReceipt />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/enroll"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <RoleBasedLayout>
                  <StudentEnrollment />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/profile"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <RoleBasedLayout>
                  <StudentProfile />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/documents"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <RoleBasedLayout>
                  <StudentDocuments />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/requests"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <RoleBasedLayout>
                  <StudentRequestsCenter />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/requests/:id"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <RoleBasedLayout>
                  <StudentRequestDetail />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/schedule"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <RoleBasedLayout>
                  <StudentSchedule />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/graduation-path"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <RoleBasedLayout>
                  <StudentGraduationPath />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/course-guide"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <RoleBasedLayout>
                  <StudentCourseGuide />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/course-catalog"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <RoleBasedLayout>
                  <StudentCourseCatalog />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/holds"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <RoleBasedLayout>
                  <StudentHolds />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/coming-soon"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <RoleBasedLayout>
                  <StudentComingSoon />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/elearning/sessions"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <RoleBasedLayout>
                  <StudentTeamsSessions />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/elearning/sessions/history"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <RoleBasedLayout>
                  <StudentSessionHistory />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/elearning/sessions/:classScheduleId/:sessionDate/lobby"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <RoleBasedLayout>
                  <StudentSessionLobby />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/elearning/elibrary"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <RoleBasedLayout>
                  <StudentELibrary />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/elearning/progress"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <RoleBasedLayout>
                  <StudentLearningProgress />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/elearning/study-planner"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <RoleBasedLayout>
                  <StudentStudyPlanner />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/elearning/courseware"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <RoleBasedLayout>
                  <StudentCourseware />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/elearning/courseware/:classId"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <RoleBasedLayout>
                  <StudentLessonViewer />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/elearning/courseware/:classId/lesson/:lessonId"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <RoleBasedLayout>
                  <StudentLessonViewer />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/elearning/exams"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <RoleBasedLayout>
                  <StudentELearningExams />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/elearning/exams/:examId"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <RoleBasedLayout>
                  <StudentExamRoom />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/elearning/exams/:examId/submitted"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <RoleBasedLayout>
                  <StudentExamSubmitted />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          {/* Instructor Portal Routes */}
          <Route
            path="/instructor/dashboard"
            element={
              <ProtectedRoute allowedRoles={['instructor']}>
                <RoleBasedLayout>
                  <InstructorDashboard />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/courses"
            element={
              <ProtectedRoute allowedRoles={['instructor']}>
                <RoleBasedLayout>
                  <InstructorMyCourses />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/analytics"
            element={
              <ProtectedRoute allowedRoles={['instructor']}>
                <RoleBasedLayout>
                  <InstructorCourseAnalytics />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/communication"
            element={
              <ProtectedRoute allowedRoles={['instructor']}>
                <RoleBasedLayout>
                  <InstructorCommunication />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/curriculum-map"
            element={
              <ProtectedRoute allowedRoles={['instructor']}>
                <RoleBasedLayout>
                  <InstructorCurriculumMap />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/build-lessons"
            element={
              <ProtectedRoute allowedRoles={['instructor']}>
                <RoleBasedLayout>
                  <InstructorBuildLesson />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/lesson-preview"
            element={
              <ProtectedRoute allowedRoles={['instructor', 'admin', 'user']}>
                <RoleBasedLayout>
                  <InstructorLessonPreview />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/content-release"
            element={
              <ProtectedRoute allowedRoles={['instructor']}>
                <RoleBasedLayout>
                  <InstructorContentRelease />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/templates"
            element={
              <ProtectedRoute allowedRoles={['instructor']}>
                <RoleBasedLayout>
                  <InstructorTemplates />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/question-bank"
            element={
              <ProtectedRoute allowedRoles={['instructor']}>
                <RoleBasedLayout>
                  <InstructorQuestionBank />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/assessments"
            element={
              <ProtectedRoute allowedRoles={['instructor']}>
                <RoleBasedLayout>
                  <InstructorAssessmentAuthoring />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/exam-settings"
            element={
              <ProtectedRoute allowedRoles={['instructor']}>
                <RoleBasedLayout>
                  <InstructorExamSettings />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/integrity-cases"
            element={
              <ProtectedRoute allowedRoles={['instructor']}>
                <RoleBasedLayout>
                  <InstructorIntegrityCases />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/workload"
            element={
              <ProtectedRoute allowedRoles={['instructor']}>
                <RoleBasedLayout>
                  <InstructorWorkload />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/reports"
            element={
              <ProtectedRoute allowedRoles={['instructor']}>
                <RoleBasedLayout>
                  <InstructorReports />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/preview-exam"
            element={
              <ProtectedRoute allowedRoles={['instructor']}>
                <InstructorExamPagePreview />
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/monitor-exam"
            element={
              <ProtectedRoute allowedRoles={['instructor']}>
                <RoleBasedLayout>
                  <InstructorExamMonitor />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/grade-exam"
            element={
              <ProtectedRoute allowedRoles={['instructor']}>
                <RoleBasedLayout>
                  <InstructorManualGrading />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/integrity-settings"
            element={
              <ProtectedRoute allowedRoles={['instructor']}>
                <RoleBasedLayout>
                  <InstructorComingSoon />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/gradebook"
            element={
              <ProtectedRoute allowedRoles={['instructor']}>
                <RoleBasedLayout>
                  <InstructorGradebook />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/grade-submission"
            element={
              <ProtectedRoute allowedRoles={['instructor']}>
                <GradeSubmissionRedirect />
              </ProtectedRoute>
            }
          />
          {/* Instructor Subject/Class Routes - More specific routes first */}
          <Route
            path="/instructor/subjects/:id/homework/:homeworkId/edit"
            element={
              <ProtectedRoute allowedRoles={['instructor']}>
                <RoleBasedLayout>
                  <EditHomework />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/subjects/:id/materials/create"
            element={
              <ProtectedRoute allowedRoles={['instructor']}>
                <RoleBasedLayout>
                  <CreateMaterial />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/subjects/:id/materials/:materialId/edit"
            element={
              <ProtectedRoute allowedRoles={['instructor']}>
                <RoleBasedLayout>
                  <EditMaterial />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/subjects/:id/homework/create"
            element={
              <ProtectedRoute allowedRoles={['instructor']}>
                <RoleBasedLayout>
                  <CreateHomework />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/subjects/:id/exams/create"
            element={
              <ProtectedRoute allowedRoles={['instructor']}>
                <RoleBasedLayout>
                  <CreateExam />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/instructor/subjects/:id"
            element={
              <ProtectedRoute allowedRoles={['instructor']}>
                <RoleBasedLayout>
                  <InstructorSubjectView />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          {/* Finance Routes */}
          <Route
            path="/finance/invoices"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <InvoiceManagement />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/finance/invoices/create"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <CreateInvoice />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/finance/invoices/:id"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <ViewInvoice />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/finance/wallet"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <CreditWallet />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/finance/reports"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <FinanceReports />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/finance/donations"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <Donations />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/finance/donations/create"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <CreateDonation />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/finance/donations/:id/edit"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <CreateDonation />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/finance/installments"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <InstallmentPlans />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/finance/installments/create"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <CreateInstallmentPlan />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/finance/installments/:id/edit"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <CreateInstallmentPlan />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/finance/configuration"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <FinanceConfiguration />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/finance/configuration/create"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <CreateFeeStructure />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/finance/configuration/:id/edit"
            element={
              <ProtectedRoute>
                <RoleBasedLayout>
                  <CreateFeeStructure />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/finance/configuration/types/create"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <RoleBasedLayout>
                  <CreateFeeType />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/finance/configuration/types/:id/edit"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <RoleBasedLayout>
                  <CreateFeeType />
                </RoleBasedLayout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
        </CollegeProvider>
      </AuthProvider>
    </LanguageProvider>
  )
}

export default App
