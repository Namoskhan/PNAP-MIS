import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { SkeletonRows } from '../components/Skeleton';
import MemberRegisterModal from '../components/MemberRegisterModal';
import { hasPermission } from '../utils/permissions';

const STATUSES = ['', 'PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'INACTIVE', 'SUSPENDED'];

const COLUMNS = [
  { key: 'memberId', label: 'Member ID', sortable: true },
  { key: 'fullName', label: 'Name', sortable: true },
  { key: 'cnic', label: 'CNIC', sortable: true },
  { key: 'phone', label: 'Phone', sortable: false },
  { key: 'unit', label: 'Unit', sortable: false },
  { key: 'district', label: 'District', sortable: false },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'view', label: '', sortable: false },
];

export default function MemberListPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [sort, setSort] = useState({ key: null, dir: 'asc' });

  const isHigherAdmin = ['SUPER_ADMIN'].some((r) => user?.roles?.includes(r));
  const scopeParams = (() => {
    if (isHigherAdmin) return {};
    if (user?.scope?.areaId) return { areaId: user.scope.areaId };
    if (user?.scope?.districtId) return { districtId: user.scope.districtId };
    if (user?.scope?.provinceId) return { provinceId: user.scope.provinceId };
    return {};
  })();

  async function load() {
    setLoading(true);
    try {
      const res = await api.get('/members', {
        // scope:'all' is the explicit opt-in for the browse-everything
        // case (Super Admin with no scopeParams and no search term).
        // Ignored server-side for anyone who has a territorial scope.
        params: { q, status, page, limit: 20, scope: 'all', ...scopeParams },
      });
      setItems(res.data.data);
      setMeta(res.data.meta);
    } catch (e) {
      toast.error('Could not load members. Please retry.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [page, status]);

  function onSearch(e) {
    e.preventDefault();
    setPage(1);
    load();
  }

  // Permission-driven — any role granted REGISTER_MEMBER (built-in
  // tier admins + Senior Mawin / Secretary / General Sec by default,
  // plus any custom role the admin enables in Role Management).
  const showRegisterButton = hasPermission(user, 'REGISTER_MEMBER');

  function toggleSort(key) {
    setSort((s) => {
      if (s.key !== key) return { key, dir: 'asc' };
      if (s.dir === 'asc') return { key, dir: 'desc' };
      return { key: null, dir: 'asc' };
    });
  }

  // Client-side sort on the current page (server returns paged set).
  const sortedItems = useMemo(() => {
    if (!sort.key) return items;
    const sorter = (a, b) => {
      let av, bv;
      switch (sort.key) {
        case 'memberId': av = a.memberId || ''; bv = b.memberId || ''; break;
        case 'fullName': av = a.fullName || ''; bv = b.fullName || ''; break;
        case 'cnic': av = a.cnic || ''; bv = b.cnic || ''; break;
        case 'status': av = a.status || ''; bv = b.status || ''; break;
        default: return 0;
      }
      return av.localeCompare(bv) * (sort.dir === 'asc' ? 1 : -1);
    };
    return [...items].sort(sorter);
  }, [items, sort]);

  return (
    <div>
      <div className="page-header">
        <h2>Members{!isHigherAdmin && user?.scope?.areaId ? ' in your area' : ''}</h2>
        {showRegisterButton && (
          <button className="btn" type="button" onClick={() => setRegisterOpen(true)}>
            + Register Member
          </button>
        )}
      </div>

      <MemberRegisterModal
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        onSuccess={(member) => {
          toast.success(`${member?.fullName || 'Member'} submitted for approval`, { title: 'Registration received' });
          setPage(1);
          load();
        }}
      />

      <form className="toolbar" onSubmit={onSearch}>
        <input
          placeholder="Search by name, CNIC, phone, member ID"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ minWidth: 280 }}
        />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          {STATUSES.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
        </select>
        <button className="btn secondary" type="submit">Search</button>
      </form>

      <table className="smart">
        <thead>
          <tr>
            {COLUMNS.map((c) => {
              const sorted = sort.key === c.key;
              return (
                <th
                  key={c.key}
                  className={`${c.sortable ? 'sortable' : ''}${sorted ? ' sorted' : ''}`}
                  onClick={c.sortable ? () => toggleSort(c.key) : undefined}
                >
                  {c.label}
                  {c.sortable && (
                    <span className="sort-arrow">
                      {sorted ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading && items.length === 0 && <SkeletonRows rows={6} cols={8} />}
          {!loading && sortedItems.length === 0 && (
            <tr>
              <td colSpan="8" style={{ padding: 0 }}>
                <div className="empty-smart" style={{ border: 'none', padding: 36 }}>
                  <div className="empty-icon">🔍</div>
                  <h3>No members found</h3>
                  <p>{q || status ? 'Try adjusting your filters.' : 'Be the first to register a member.'}</p>
                </div>
              </td>
            </tr>
          )}
          {!loading && sortedItems.map((m) => (
            <tr key={m._id}>
              <td className="cell-strong">{m.memberId || <span className="cell-muted">—</span>}</td>
              <td className="cell-strong">{m.fullName}</td>
              <td>{m.cnic}</td>
              <td>{m.phone}</td>
              <td>{m.basicUnitId?.name || <span className="cell-muted">—</span>}</td>
              <td>{m.districtId?.name || <span className="cell-muted">—</span>}</td>
              <td><span className={`badge ${m.status}`}>{m.status}</span></td>
              <td><Link to={`/members/${m._id}`} style={{ fontWeight: 500 }}>View →</Link></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' }}>
        <button className="btn secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
        <span className="muted" style={{ fontSize: 13 }}>
          Page <strong>{meta.page}</strong> of <strong>{meta.totalPages}</strong> · <strong>{meta.total}</strong> total
        </span>
        <button className="btn secondary" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>Next →</button>
      </div>
    </div>
  );
}
