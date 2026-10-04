import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errorMessage } from '../../api/client';

export default function ManageProvincesPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/org/provinces')
      .then((r) => setItems(r.data.data))
      .catch((e) => setErr(errorMessage(e)));
  }, []);

  return (
    <div>
      <div className="page-header">
        <h2>{t('admin.manageProvinces')}</h2>
      </div>
      <p className="muted">
        {t('admin.manageProvincesSub')}
      </p>

      {err && <div className="alert error">{err}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{t('admin.existingProvinces')}</h3>
        {items.length === 0 ? (
          <p className="muted">{t('admin.noProvinces')}</p>
        ) : (
          <table className="list">
            <thead>
              <tr>
                <th>{t('admin.name')}</th>
                <th>{t('admin.code')}</th>
                <th>{t('admin.provinceAdminUsername')}</th>
                <th>{t('admin.status')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p._id}>
                  <td><strong>{p.name}</strong></td>
                  <td>{p.code}</td>
                  <td><code>{p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}</code> <span className="muted" style={{ fontSize: 12 }}>({t('admin.password')}: 123456)</span></td>
                  <td><span className="badge ACTIVE">{p.isActive ? t('common.active') : t('common.inactive')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
