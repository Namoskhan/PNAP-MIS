import RequestLinkForm, { AuthFooter } from './RequestLinkForm';
import { forgotPassword } from '../../api/authClient';

export default function ForgotPasswordPage() {
  return (
    <RequestLinkForm
      title="Forgot your password?"
      subtitle="Enter the email or CNIC you sign in with. If we find a matching account with an email address on file, we will send a link to choose a new password."
      submitLabel="Send reset link"
      busyLabel="Sending…"
      successTitle="Reset link sent"
      successBody="If an account matches that information, an email with a password reset link is on its way. The link expires in one hour."
      onSubmit={forgotPassword}
      footer={<AuthFooter otherTo="/resend-verification" otherLabel="Resend verification email" />}
    />
  );
}
