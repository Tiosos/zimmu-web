import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge'
void broadcastResponseToMainFrame().catch(() => {
  const status = document.getElementById('status')
  if (status)
    status.textContent = 'Sign-in could not complete. Close this window and try again from Zimmu.'
})
