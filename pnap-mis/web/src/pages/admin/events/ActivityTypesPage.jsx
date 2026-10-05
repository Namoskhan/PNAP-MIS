import { useTranslation } from 'react-i18next';
import EventTypeListPage from './EventTypeListPage';
import { TargetIcon } from '../../../components/icons';

export default function ActivityTypesPage() {
  const { t } = useTranslation();
  return (
    <EventTypeListPage
      entity="ACTIVITY"
      title={t('admin.activityTypes', 'Activity Types')}
      subtitle={t('admin.activityTypesSubtitle', 'The catalogue of activity types every unit can record.')}
      icon={<TargetIcon size={22} />}
    />
  );
}
