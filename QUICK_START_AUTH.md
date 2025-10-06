# Quick Start: Authentication System

## 🎯 What You Have Now

Your app now has a **dual-mode authentication system**:

### 1. **Anonymous Mode** (Default)
- Users start immediately without signup
- Unique userHash stored in browser
- Works offline-first
- Perfect for trying the app

### 2. **Account Mode** (Optional)
- Users can upgrade to full account
- Cross-device access
- Permanent storage
- Better Auth with SQLite

## 🚀 How It Works

### For Users:

1. **Visit site** → Start drawing immediately (anonymous)
2. **See prompt** → "Save Your Art!" appears after interaction
3. **Click "Sign In"** → Create account or sign in
4. **Authenticated** → Access art from any device

### For You (Developer):

The system automatically:
- ✅ Assigns userHash to new visitors
- ✅ Shows account prompt after interaction
- ✅ Handles sign up/sign in
- ✅ Reconnects WebSocket with auth token
- ✅ Updates UI to show user status

## 📱 UI Elements

### Top Navigation Bar:

**Anonymous User:**
```
👤 Anonymous  [🔐 Sign In]
```

**Authenticated User:**
```
✓ Username  [Sign Out]
```

### Account Prompt (Bottom Right):
```
💾 Save Your Art!
You're currently using anonymous mode. Create a free account to:
• Access your art from any device
• Keep your activities permanently
• Build your creative portfolio

[Create Account] [Maybe Later]
☐ Don't show this again
```

### Auth Modal:
```
Welcome Back! / Create Account
[Email input]
[Password input]
[Display Name input] (signup only)
[Sign In / Sign Up button]
[Toggle: Sign In ↔ Sign Up]
```

## 🔧 Testing Locally

### 1. Start Server:
```bash
cd server
npm start
# Should see: [Auth] Better Auth initialized successfully
```

### 2. Start Client:
```bash
cd client
npm run dev
# Opens at http://localhost:3000
```

### 3. Test Anonymous Mode:
- Open browser
- Should see "👤 Anonymous" in header
- Create an activity
- Account prompt should appear

### 4. Test Sign Up:
- Click "Sign In" button
- Switch to "Sign Up" tab
- Enter email: `test@example.com`
- Enter password: `password123`
- Enter name: `Test User`
- Click "Sign Up"
- Should see "✓ Test User" in header

### 5. Test Sign Out:
- Click "Sign Out"
- Page reloads
- Back to "👤 Anonymous"

### 6. Test Sign In:
- Click "Sign In"
- Enter same credentials
- Should authenticate successfully

## 🌐 Production Deployment

### Vercel (Client):
Already configured! Just push to main branch.

Environment variables needed:
```
VITE_API_URL=https://realtime-collab-server-production.up.railway.app
VITE_WS_URL=wss://realtime-collab-server-production.up.railway.app
```

### Railway (Server):
Already configured! Auto-deploys from main branch.

Environment variables needed:
```
AUTH_SECRET=<generate with: openssl rand -base64 32>
AUTH_BASE_URL=https://realtime-collab-server-production.up.railway.app
CLIENT_URL=https://www.alamuna.art
REDIS_HOST=<your redis host>
REDIS_PORT=<your redis port>
REDIS_PASSWORD=<your redis password>
```

## 🐛 Troubleshooting

### "Nothing happens when I load the page"
- Check browser console for errors
- Verify server is running
- Check WebSocket connection

### "Sign In button doesn't appear"
- Check if `session` prop is passed to MapView
- Verify Better Auth is initialized (server logs)

### "Account prompt doesn't show"
- Check localStorage: `accountPromptDismissed`
- Clear it: `localStorage.removeItem('accountPromptDismissed')`

### "Sign up fails"
- Check server logs for Better Auth errors
- Verify AUTH_SECRET is set
- Check SQLite database is writable

### "User status doesn't update after sign in"
- Check WebSocket reconnection in console
- Verify auth token is being sent
- Check server logs for session verification

## 📊 User Data Flow

### Anonymous User:
```
Browser → userHash (localStorage)
       → WebSocket (userHash param)
       → Server (anonymous identity)
```

### Authenticated User:
```
Browser → Better Auth (session cookie)
       → WebSocket (token param)
       → Server (verified user identity)
       → SQLite (user data)
```

## 🎨 Customization

### Change Account Prompt Timing:
Edit `client/src/components/AccountPrompt.jsx`:
```javascript
// Show after 30 seconds instead of immediately
onMount(() => {
  setTimeout(() => {
    // Show prompt logic
  }, 30000);
});
```

### Change Prompt Position:
Edit `AccountPrompt.jsx` styles:
```javascript
style={{
  position: 'fixed',
  bottom: '20px',  // Change to 'top: 20px' for top
  right: '20px',   // Change to 'left: 20px' for left
  // ...
}}
```

### Change Button Colors:
Edit `MapView.jsx`:
```javascript
background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
// Change to your brand colors
```

## 📈 Next Steps

### Immediate:
1. ✅ Test locally
2. ✅ Deploy to production
3. ✅ Verify on www.alamuna.art

### Future Enhancements:
1. **Link anonymous activities to account** when user signs up
2. **Add OAuth providers** (Google, GitHub)
3. **Email verification** for security
4. **User profiles** with avatars
5. **Activity migration prompt** on signup

## 🔐 Security Notes

### Current Security:
- ✅ Passwords hashed by Better Auth
- ✅ Sessions stored in secure cookies
- ✅ CORS configured for production domain
- ✅ Auth token verified on WebSocket connection

### Recommendations:
- 🔒 Use strong AUTH_SECRET (32+ characters)
- 🔒 Enable HTTPS in production (already done)
- 🔒 Consider email verification for sensitive data
- 🔒 Implement rate limiting for auth endpoints

## 📞 Support

If something doesn't work:

1. **Check server logs** (Railway dashboard)
2. **Check browser console** (F12)
3. **Verify environment variables** (Vercel & Railway)
4. **Test locally first** before debugging production

## ✅ Success Checklist

- [ ] Server starts with "Better Auth initialized successfully"
- [ ] Client shows "👤 Anonymous" for new users
- [ ] Account prompt appears after interaction
- [ ] "Sign In" button opens modal
- [ ] Sign up creates account successfully
- [ ] User status updates to "✓ Username"
- [ ] Sign out returns to anonymous mode
- [ ] Production deployment works on www.alamuna.art

## 🎉 You're All Set!

Your app now has a professional authentication system that:
- Lets users start immediately (no friction)
- Encourages account creation (with benefits)
- Provides cross-device access (when authenticated)
- Respects user choice (can dismiss prompt)

Enjoy building your collaborative art platform! 🎨✨

