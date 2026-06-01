# Authentication Fix Guide

## What Was Fixed 

1. **Non-blocking session initialization**: The auth context no longer blocks the UI if `getSession()` is slow
2. **Timeout protection**: Added 2-second timeout to prevent infinite loading
3. **Better error handling**: Gracefully handles network issues and connection problems
4. **Primary listener**: Uses `onAuthStateChange` as the primary way to get sessions

## Supabase Configuration Check

### 1. Verify Environment Variables

Make sure your `.env` file has:
```env
VITE_SUPABASE_URL=https://xgavrsqjlgvxvexeptdw.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

### 2. Check Supabase Dashboard

1. Go to your Supabase project dashboard
2. Check **Settings > API**:
   - Verify the URL matches your `.env` file
   - Verify the anon/public key matches
   
3. Check **Authentication > Settings**:
   - Ensure "Enable email signup" is ON
   - Check "Site URL" is set correctly (for local dev: `http://localhost:5173`)
   - Check "Redirect URLs" includes `http://localhost:5173/**`

### 3. Check Network/Connection

Open browser DevTools (F12) and check:
- **Console tab**: Look for any Supabase connection errors
- **Network tab**: Check if requests to `*.supabase.co` are being made
- **Application > Local Storage**: Check if `sb-xgavrsqjlgvxvexeptdw-auth-token` exists

### 4. Test Connection

Run this in browser console:
```javascript
// Check if Supabase client is initialized
console.log('Supabase URL:', import.meta.env.VITE_SUPABASE_URL)
console.log('Supabase Key:', import.meta.env.VITE_SUPABASE_ANON_KEY ? 'Set' : 'Missing')

// Test connection
import { supabase } from './src/lib/supabase'
supabase.auth.getSession().then(({ data, error }) => {
  console.log('Session test:', error ? 'Error: ' + error.message : 'Success', data)
})
```

## Common Issues

### Issue: "Auth initialization timeout"
**Cause**: `getSession()` is taking too long or failing silently
**Fix**: The new code handles this gracefully - the app will continue loading even if session fetch times out

### Issue: No API calls being made
**Possible causes**:
1. Environment variables not loaded (restart dev server)
2. Supabase URL/key incorrect
3. Network/CORS issues
4. Supabase project paused or deleted

**Fix**:
1. Restart dev server: `npm run dev`
2. Verify `.env` file is in root directory
3. Check Supabase dashboard for project status
4. Check browser console for CORS errors

### Issue: Session not persisting
**Fix**: 
- Check localStorage in browser DevTools
- Verify `storageKey` in `supabase.js` matches localStorage key
- Clear localStorage and login again

## If Still Having Issues

1. **Clear browser data**:
   - Open DevTools > Application > Clear storage > Clear site data
   - Or manually delete `sb-xgavrsqjlgvxvexeptdw-auth-token` from localStorage

2. **Restart everything**:
   ```bash
   # Stop dev server (Ctrl+C)
   # Clear node_modules and reinstall
   rm -rf node_modules package-lock.json
   npm install
   npm run dev
   ```

3. **Check Supabase status**:
   - Visit https://status.supabase.com
   - Check your project dashboard for any warnings

4. **Verify RLS policies**:
   - Go to Supabase Dashboard > Authentication > Policies
   - Ensure `users` table has proper RLS policies if enabled



