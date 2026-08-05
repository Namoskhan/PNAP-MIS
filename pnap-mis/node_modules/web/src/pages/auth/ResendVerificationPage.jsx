import RequestLinkForm, { AuthFooter } from './RequestLinkForm';
import { resendVerification } from '../../api/authClient';

export default function ResendVerificationPage() {
  return (
    <RequestLinkForm
      title="Resend verification email"
      subtitle="Enter the email, username or CNIC you sign in with and we will send a fresh confirmation link. Any earlier link stops working."
      submitLabel="Send verification email"
      busyLabel="Sending…"
      successTitle="Verification email sent"
      successBody="If an account matches that information and still needs confirming, a new link is on its way. It expires in 24 hours."
      onSubmit={resendVerification}
      footer={<AuthFooter otherTo="/forgot-password" otherLabel="Forgot password?" />}
    />
  );
}
