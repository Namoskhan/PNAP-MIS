import { useTranslation } from 'react-i18next';
import RequestLinkForm, { AuthFooter } from './RequestLinkForm';
import { forgotPassword } from '../../api/authClient';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();

  return (
    <RequestLinkForm
      title={t('auth.forgotYourPassword', 'Forgot your password?')}
      subtitle={t('auth.forgotPasswordSubtitle', 'Enter the email or CNIC you sign in with. If we find a matching account with an email address on file, we will send a link to choose a new password.')}
      submitLabel={t('auth.sendResetLink', 'Send reset link')}
      busyLabel={t('auth.sending', 'Sending…')}
      successTitle={t('auth.resetLinkSent', 'Reset link sent')}
      successBody={t('auth.resetLinkSentBody', 'If an account matches that information, an email with a password reset link is on its way. The link expires in one hour.')}
      onSubmit={forgotPassword}
      footer={<AuthFooter otherTo="/resend-verification" otherLabel={t('auth.resendVerificationEmail', 'Resend verification email')} />}
    />
  );
}
