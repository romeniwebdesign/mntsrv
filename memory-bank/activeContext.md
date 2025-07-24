# Active Context

## Current Work Focus
- Implemented comprehensive role-based user management system
- Added permission-based access control throughout the application
- Created admin interface for user management
- Enhanced authentication system with role support

## Recent Changes
- **Backend Changes:**
  - Extended `auth_service.py` with role-based permissions and permission checking functions
  - Updated login endpoint to return user role information in JWT tokens
  - Created `user_service.py` for user CRUD operations
  - Added `users.py` routes for admin user management
  - Updated `share.py` routes to enforce permissions
  - Added file delete and rename endpoints with permission checks
  - Enhanced share service with subfolder navigation and ZIP download functionality
  - Registered user management routes in `main.py`

- **Frontend Changes:**
  - Updated `Login.js` to store user information in localStorage
  - Modified `App.js` to handle user roles, admin navigation, and global auth error handling
  - Created `UserManagement.js` component for admin user management interface
  - Enhanced `FolderBrowser.js` with permission-based UI, delete/rename functionality
  - Completely redesigned `ShareView.js` with folder navigation, breadcrumbs, and bulk downloads
  - Added conditional navigation and routes based on user roles
  - Implemented global `authFetch` wrapper for automatic session handling
  - **Code Quality Improvement:** Refactored `FolderBrowser.js` to eliminate duplicated path construction logic by extracting a `constructPath()` helper function

- **Configuration:**
  - Populated `users.json` with sample users for different roles

## Next Steps
- Test the complete user management system functionality
- Document the new user roles and permissions in project documentation
- Consider adding file upload functionality for power users and admins
- Add audit logging for file operations and user management actions

## Important TODOs for Future Development

### 1. Password Reset System
- **Problem**: Users cannot reset their own passwords, and there's no email system
- **Solution**: Implement admin notification system for password reset requests
- **Implementation Ideas**:
  - Add "Request Password Reset" button on login page
  - Create notification system for admins (in-app notifications or simple queue)
  - Allow admins to see pending password reset requests
  - Provide admin interface to reset user passwords
  - Optional: Add temporary password generation with forced change on next login

### 2. Internationalization (i18n)
- **Problem**: Interface is currently only in German
- **Solution**: Implement multi-language support
- **Implementation Ideas**:
  - Add language selection in user preferences or header
  - Create translation files for different languages (EN, DE, etc.)
  - Use React i18n library (react-i18next)
  - Translate all UI text, error messages, and labels
  - Store language preference in localStorage or user profile
  - Support for RTL languages if needed
- **Priority Languages**: English (primary), German (current), potentially French, Spanish

## Latest Enhancement: Critical Authentication Bug Fixes
- **Fixed Authentication Issues:**
  - Updated `SearchBar.js` to use `authFetch` instead of old `fetch`
  - Updated `StatsPage.js` to use `authFetch` for shares API call
  - Fixed `FolderBrowser.js` rescan button to use `authFetch`
  - Enhanced `ShareForm.js` with proper authentication error handling
  - Updated `App.js` to pass `authFetch` prop to SearchBar and StatsPage

- **Security Improvements:**
  - All components now use consistent authentication handling
  - Expired sessions properly trigger automatic logout
  - Authentication failures are handled gracefully without showing generic errors
  - Session management is now consistent across all API calls

## Previous Enhancement: User-Specific Share Management
- **Backend Changes:**
  - Modified `share_service.py` to track share creators with `created_by` and `created_at` fields
  - Updated `list_shares_service()` to filter shares by user (admins see all, others see only their own)
  - Enhanced `delete_share_service()` to enforce ownership (users can only delete their own shares, admins can delete any)
  
- **Frontend Changes:**
  - Updated `SharesPage.js` to use `authFetch` and display creator information for admins
  - Modified `App.js` to pass user context to SharesPage component
  
- **Security Enhancement:**
  - Share visibility is now properly scoped to the creator
  - Admin users have oversight capability to see and manage all shares
  - Non-admin users are restricted to their own shares only

## Active Decisions and Considerations
- **Role-Based Access Control:** Implemented 4 user roles:
  - `admin`: Full access + user management
  - `power`: Browse, download, share, delete, rename
  - `standard`: Browse, download, share
  - `readonly`: Browse and download only
- **Permission System:** Uses decorator-based permission checking in backend
- **Admin Interface:** Only visible to admin users, provides full user management capabilities

## Important Patterns and Preferences
- Permission checking at both backend (API level) and frontend (UI level)
- Role information stored in JWT tokens and localStorage
- Consistent permission naming across backend and frontend
- Graceful degradation of UI based on user permissions

## Learnings and Project Insights
- Role-based permissions significantly enhance security and user experience
- Storing user context in localStorage enables persistent role-based UI rendering
- Permission decorators provide clean, reusable access control in FastAPI
- Admin interfaces should be conditionally rendered based on user roles
