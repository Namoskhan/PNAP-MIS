import { useTranslation } from 'react-i18next';
import RequestLinkForm, { AuthFooter } from './RequestLinkForm';
import { resendVerification } from '../../api/authClient';

export default function ResendVerificationPage() {
  const { t } = useTranslation();

  return (
    <RequestLinkForm
      title={t('auth.resendVerification', 'Resend verification email')}
      subtitle={t('auth.resendVerificationSubtitle', 'Enter the email or CNIC you sign in with and we will send a fresh confirmation link. Any earlier link stops working.')}
      submitLabel={t('auth.sendVerificationEmail', 'Send verification email')}
      busyLabel={t('auth.sending', 'Sending…')}
      successTitle={t('auth.verificationSent', 'Verification email sent')}
      successBody={t('auth.verificationSentBody', 'If an account matches that information and still needs confirming, a new link is on its way. It expires in 24 hours.')}
      onSubmit={resendVerification}
      footer={<AuthFooter otherTo="/forgot-password" otherLabel={t('auth.forgotPassword', 'Forgot password?')} />}
    />
  );
}
