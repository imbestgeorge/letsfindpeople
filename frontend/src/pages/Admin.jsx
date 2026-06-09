import { useState, useEffect, useRef, useCallback } from 'react';
import { Chart, registerables } from 'chart.js';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const sanitizePostgrestOrTerm = (value) => value.replace(/[%,()]/g, ' ').trim();
const CATALOG_CACHE_KEY = 'lfp_catalog';

function Admin() {
  useAuth(); // establishes auth context; no fields needed in this component
  const [page, setPage] = useState(0);
  const [selectedYear, setSelectedYear] = useState(2026);
  const [currentUserPage, setCurrentUserPage] = useState(1);
  const [currentLogPage, setCurrentLogPage] = useState(1);

  const utilizadoresChartRef = useRef(null);
  const rendimentoChartRef = useRef(null);
  const pagamentosChartRef = useRef(null);

  const chartInstancesRef = useRef({
    utilizadores: null,
    rendimento: null,
    pagamentos: null
  });

  const usersPerPage = 20;
  const logsPerPage = 20;

  // Real users state
  const [users, setUsers] = useState([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState(null);
  const [userSearchInput, setUserSearchInput] = useState('');
  const [userSearch, setUserSearch] = useState('');

  // Real logs state
  const [logs, setLogs] = useState([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState(null);
  const [logActions, setLogActions] = useState([]);
  const [logActionId, setLogActionId] = useState('');
  const [logDateInput, setLogDateInput] = useState('');
  const [logDate, setLogDate] = useState('');

  // Real statistics state
  const [statsError, setStatsError] = useState(null);
  const [statsChartData, setStatsChartData] = useState(null);

  // Requested keywords state
  const [requestedKeywords, setRequestedKeywords] = useState([]);
  const [requestedKeywordsTotal, setRequestedKeywordsTotal] = useState(0);
  const [requestedKeywordsLoading, setRequestedKeywordsLoading] = useState(false);
  const [requestedKeywordsError, setRequestedKeywordsError] = useState(null);
  const [currentRequestPage, setCurrentRequestPage] = useState(1);
  const requestsPerPage = 20;

  // Subcategories for edit modal
  const [subcategories, setSubcategories] = useState([]);

  // Edit requested keyword modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingKeyword, setEditingKeyword] = useState(null);
  const [editName, setEditName] = useState('');
  const [editSubcategoryId, setEditSubcategoryId] = useState('');

  // Keywords table state
  const [keywords, setKeywords] = useState([]);
  const [keywordsTotal, setKeywordsTotal] = useState(0);
  const [keywordsLoading, setKeywordsLoading] = useState(false);
  const [keywordsError, setKeywordsError] = useState(null);
  const [currentKeywordPage, setCurrentKeywordPage] = useState(1);
  const [keywordSearchInput, setKeywordSearchInput] = useState('');
  const [keywordSearch, setKeywordSearch] = useState('');
  const keywordsPerPage = 20;

  // Edit keyword modal state
  const [showEditKeywordModal, setShowEditKeywordModal] = useState(false);
  const [editingKw, setEditingKw] = useState(null);
  const [editKwName, setEditKwName] = useState('');
  const [editKwSubcategoryId, setEditKwSubcategoryId] = useState('');

  // Add keyword modal state
  const [showAddKeywordModal, setShowAddKeywordModal] = useState(false);
  const [newKeywordName, setNewKeywordName] = useState('');
  const [newKeywordSubcategoryId, setNewKeywordSubcategoryId] = useState('');

  // Create charts function
  const createCharts = useCallback(() => {
    // Destroy existing charts before creating new ones
    if (chartInstancesRef.current.utilizadores) {
      chartInstancesRef.current.utilizadores.destroy();
    }
    if (chartInstancesRef.current.rendimento) {
      chartInstancesRef.current.rendimento.destroy();
    }
    if (chartInstancesRef.current.pagamentos) {
      chartInstancesRef.current.pagamentos.destroy();
    }

    if (!statsChartData) return;

    // Utilizadores Chart
    if (utilizadoresChartRef.current) {
      const ctx = utilizadoresChartRef.current.getContext('2d');
      chartInstancesRef.current.utilizadores = new Chart(ctx, {
        type: 'line',
        data: {
          labels: MONTH_LABELS,
          datasets: [{
            label: 'Users',
            data: statsChartData.users.cumulative,
            borderColor: '#0d6efd',
            backgroundColor: 'rgba(13, 110, 253, 0.1)',
            tension: 0.4,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            }
          },
          scales: {
            y: {
              beginAtZero: true
            }
          }
        }
      });
    }

    // Rendimento Chart
    if (rendimentoChartRef.current) {
      const ctx = rendimentoChartRef.current.getContext('2d');
      chartInstancesRef.current.rendimento = new Chart(ctx, {
        type: 'line',
        data: {
          labels: MONTH_LABELS,
          datasets: [{
            label: 'Basic Plan',
            data: statsChartData.revenue,
            borderColor: '#198754',
            backgroundColor: 'rgba(25, 135, 84, 0.1)',
            tension: 0.4,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'bottom'
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: function(value) {
                  return '€' + value;
                }
              }
            }
          }
        }
      });
    }

    // Pagamentos Chart
    if (pagamentosChartRef.current) {
      const ctx = pagamentosChartRef.current.getContext('2d');
      chartInstancesRef.current.pagamentos = new Chart(ctx, {
        type: 'line',
        data: {
          labels: MONTH_LABELS,
          datasets: [{
            label: 'Basic Plan',
            data: statsChartData.payments,
            borderColor: '#198754',
            backgroundColor: 'rgba(25, 135, 84, 0.1)',
            tension: 0.4,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'bottom'
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                stepSize: 1
              }
            }
          }
        }
      });
    }
  }, [statsChartData]);

  const fetchUsers = useCallback(async (pageNum, search) => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const offset = (pageNum - 1) * usersPerPage;
      let query = supabase
        .from('users')
        .select('id_user, supabase_uid, first_name, last_name, email, is_banned, is_deleted, suspended_until, suspension_violation_count, id_type', { count: 'exact' })
        .eq('is_deleted', false);
      const safeSearch = sanitizePostgrestOrTerm(search || '');
      if (safeSearch) {
        query = query.or(`email.ilike.%${safeSearch}%,first_name.ilike.%${safeSearch}%,last_name.ilike.%${safeSearch}%`);
      }
      const { data, count, error } = await query
        .order('id_user', { ascending: false })
        .range(offset, offset + usersPerPage - 1);
      if (error) throw new Error(error.message);
      const users = (data || []).map((u) => {
        const suspendedUntil = u.suspended_until ? new Date(u.suspended_until) : null;
        const isSuspended = suspendedUntil && suspendedUntil.getTime() > Date.now();
        return ({
        id:          u.id_user,
        supabaseUid: u.supabase_uid,
        name:        [u.first_name, u.last_name].filter(Boolean).join(' ') || '',
        email:       u.email || '-',
        isBanned:    u.is_banned || false,
        isSuspended,
        suspendedUntil,
        violationCount: u.suspension_violation_count || 0,
        isAdmin:     u.id_type === 2,
        });
      });
      setUsers(users);
      setUsersTotal(count || 0);
    } catch (err) {
      setUsersError(err.message);
    } finally {
      setUsersLoading(false);
    }
  }, [usersPerPage]);

  const fetchLogs = useCallback(async (pageNum, actionId, date) => {
    setLogsLoading(true);
    setLogsError(null);
    try {
      const offset = (pageNum - 1) * logsPerPage;
      let countQuery = supabase.from('logs').select('*', { count: 'exact', head: true });
      let rowsQuery  = supabase
        .from('logs')
        .select('id_log, id_user, id_action, status, reason, ip, metadata, created_at, users(email), actions(name)');
      if (actionId) {
        countQuery = countQuery.eq('id_action', actionId);
        rowsQuery  = rowsQuery.eq('id_action', actionId);
      }
      if (date) {
        const dateFrom = new Date(`${date}T00:00:00`).toISOString();
        const dateTo   = new Date(`${date}T23:59:59.999`).toISOString();
        countQuery = countQuery.gte('created_at', dateFrom).lte('created_at', dateTo);
        rowsQuery  = rowsQuery.gte('created_at', dateFrom).lte('created_at', dateTo);
      }
      const { count, error: countErr } = await countQuery;
      if (countErr) throw new Error(countErr.message);
      const { data: rows, error: rowsErr } = await rowsQuery
        .order('created_at', { ascending: false })
        .range(offset, offset + logsPerPage - 1);
      if (rowsErr) throw new Error(rowsErr.message);
      const logs = (rows || []).map((r) => ({
        id:          r.id_log,
        user:        r.users?.email || r.metadata?.targetEmail || 'Anonymous',
        ip:          r.ip || '-',
        action:      r.actions?.name || String(r.id_action),
        status:      r.status,
        statusColor: r.status === 'Success' ? 'green' : r.status === 'Error' ? 'red' : 'orange',
        reason:      r.reason || r.metadata?.targetEmail || '',
        date:        new Date(r.created_at).toLocaleString('en-GB', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
        }),
      }));
      setLogs(logs);
      setLogsTotal(count || 0);
    } catch (err) {
      setLogsError(err.message);
    } finally {
      setLogsLoading(false);
    }
  }, [logsPerPage]);

  const fetchLogActions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('actions')
        .select('id_action, name')
        .order('name');
      if (error) return;
      setLogActions((data || []).map((a) => ({ id: a.id_action, name: a.name })));
    } catch (err) { console.warn('Failed to load actions:', err.message); }
  }, []);

  const fetchStats = useCallback(async (year) => {
    setStatsError(null);
    try {
      const yearStart = new Date(`${year}-01-01T00:00:00.000Z`).toISOString();
      const yearEnd   = new Date(`${year + 1}-01-01T00:00:00.000Z`).toISOString();
      const [statsResult, usersResult, priorResult] = await Promise.all([
        supabase.from('monthly_stats').select('month, revenue, payments').eq('year', year),
        supabase.from('users').select('created_at').gte('created_at', yearStart).lt('created_at', yearEnd).eq('is_deleted', false),
        supabase.from('users').select('*', { count: 'exact', head: true }).lt('created_at', yearStart).eq('is_deleted', false),
      ]);
      if (statsResult.error) throw new Error(statsResult.error.message);
      if (usersResult.error) throw new Error(usersResult.error.message);
      if (priorResult.error) throw new Error(priorResult.error.message);
      const newPerMonth = Array(12).fill(0);
      for (const u of usersResult.data || []) {
        const m = new Date(u.created_at).getUTCMonth();
        newPerMonth[m]++;
      }
      let running = priorResult.count || 0;
      const cumulativeUsers = newPerMonth.map((n) => (running += n));
      const statsMap = Object.fromEntries((statsResult.data || []).map((s) => [s.month, s]));
      const revenue  = Array.from({ length: 12 }, (_, i) => Number(statsMap[i + 1]?.revenue  ?? 0));
      const payments = Array.from({ length: 12 }, (_, i) => Number(statsMap[i + 1]?.payments ?? 0));
      setStatsChartData({ year, users: { new: newPerMonth, cumulative: cumulativeUsers }, revenue, payments });
    } catch (err) {
      setStatsError(err.message);
    }
  }, []);

  const fetchRequestedKeywords = useCallback(async (pageNum) => {
    setRequestedKeywordsLoading(true);
    setRequestedKeywordsError(null);
    try {
      const offset = (pageNum - 1) * requestsPerPage;
      const { count, error: countErr } = await supabase
        .from('requested_keywords')
        .select('*', { count: 'exact', head: true })
        .eq('is_disabled', false);
      if (countErr) throw new Error(countErr.message);
      const { data, error } = await supabase
        .from('requested_keywords')
        .select('id, name, request_amount, id_subcategory, subcategories(name)')
        .eq('is_disabled', false)
        .order('id', { ascending: false })
        .range(offset, offset + requestsPerPage - 1);
      if (error) throw new Error(error.message);
      setRequestedKeywords((data || []).map((r) => ({
        id:              r.id,
        name:            r.name,
        requestAmount:   r.request_amount,
        subcategoryId:   r.id_subcategory,
        subcategoryName: r.subcategories?.name || null,
      })));
      setRequestedKeywordsTotal(count || 0);
    } catch (err) {
      setRequestedKeywordsError(err.message);
    } finally {
      setRequestedKeywordsLoading(false);
    }
  }, [requestsPerPage]);

  const fetchSubcategories = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('subcategories')
        .select('id_subcategory, name, id_category, categories(name)')
        .order('id_subcategory');
      if (error) return;
      setSubcategories((data || []).map((s) => ({
        id:           s.id_subcategory,
        name:         s.name,
        categoryId:   s.id_category,
        categoryName: s.categories?.name || '',
      })));
    } catch (err) {
      console.warn('Failed to load subcategories:', err.message);
    }
  }, []);

  const fetchKeywords = useCallback(async (pageNum, search) => {
    setKeywordsLoading(true);
    setKeywordsError(null);
    try {
      const offset = (pageNum - 1) * keywordsPerPage;
      let countQuery = supabase.from('keywords').select('*', { count: 'exact', head: true });
      let rowsQuery  = supabase
        .from('keywords')
        .select('id_keyword, name, id_subcategory, subcategories(name, id_category, categories(name))');
      if (search) {
        countQuery = countQuery.ilike('name', `%${search}%`);
        rowsQuery  = rowsQuery.ilike('name', `%${search}%`);
      }
      const { count, error: countErr } = await countQuery;
      if (countErr) throw new Error(countErr.message);
      const { data, error } = await rowsQuery
        .order('id_keyword', { ascending: false })
        .range(offset, offset + keywordsPerPage - 1);
      if (error) throw new Error(error.message);
      setKeywords((data || []).map((k) => ({
        id:              k.id_keyword,
        name:            k.name,
        subcategoryId:   k.id_subcategory,
        subcategoryName: k.subcategories?.name || null,
        categoryName:    k.subcategories?.categories?.name || null,
      })));
      setKeywordsTotal(count || 0);
    } catch (err) {
      setKeywordsError(err.message);
    } finally {
      setKeywordsLoading(false);
    }
  }, [keywordsPerPage]);

  // Fetch statistics whenever the Statistics tab is active or year changes
  useEffect(() => {
    if (page === 0) {
      fetchStats(selectedYear);
    }
  }, [page, selectedYear, fetchStats]);

  // Fetch users whenever the Users tab is active or the page/search changes
  useEffect(() => {
    if (page === 1) {
      fetchUsers(currentUserPage, userSearch);
    }
  }, [page, currentUserPage, userSearch, fetchUsers]);

  // Fetch logs whenever the Logs tab is active or the page/filters change
  useEffect(() => {
    if (page === 3) {
      if (logActions.length === 0) fetchLogActions();
      fetchLogs(currentLogPage, logActionId, logDate);
    }
  }, [page, currentLogPage, logActionId, logDate, fetchLogs, fetchLogActions, logActions.length]);

  // Fetch requested keywords whenever the Keywords tab is active or request page changes
  useEffect(() => {
    if (page === 2) {
      fetchRequestedKeywords(currentRequestPage);
    }
  }, [page, currentRequestPage, fetchRequestedKeywords]);

  // Fetch keywords whenever the Keywords tab is active or keyword page/search changes
  useEffect(() => {
    if (page === 2) {
      fetchKeywords(currentKeywordPage, keywordSearch);
    }
  }, [page, currentKeywordPage, keywordSearch, fetchKeywords]);

  // Initialize charts on first render and update on year change
  useEffect(() => {
    Chart.register(...registerables);
    createCharts();

    // Store chart instances for cleanup - copy refs to local variables to avoid the React warning
    const utilizadoresChart = chartInstancesRef.current.utilizadores;
    const rendimentoChart = chartInstancesRef.current.rendimento;
    const pagamentosChart = chartInstancesRef.current.pagamentos;

    // Cleanup function to destroy charts on unmount or before recreation
    return () => {
      if (utilizadoresChart) utilizadoresChart.destroy();
      if (rendimentoChart) rendimentoChart.destroy();
      if (pagamentosChart) pagamentosChart.destroy();
    };
  }, [createCharts, page]);

  const getTotalUtilizadores = () => {
    const data = statsChartData?.users?.cumulative;
    if (!data || data.length === 0) return 0;
    return data[data.length - 1];
  };

  const getTotalRendimento = () => {
    const data = statsChartData?.revenue;
    if (!data || data.length === 0) return 0;
    return data.reduce((a, b) => a + b, 0);
  };

  const getTotalPagamentos = () => {
    const data = statsChartData?.payments;
    if (!data || data.length === 0) return 0;
    return data.reduce((a, b) => a + b, 0);
  };

  // User pagination methods (server-side)
  const getTotalUserPages = () => {
    return Math.max(1, Math.ceil(usersTotal / usersPerPage));
  };

  const getUserPageNumbers = () => {
    const totalPages = getTotalUserPages();
    const pages = [];
    let startPage = Math.max(1, currentUserPage - 4);
    let endPage = Math.min(totalPages, startPage + 9);
    
    if (endPage - startPage < 9) {
      startPage = Math.max(1, endPage - 9);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    
    return pages;
  };

  const onUserPageChange = (pageNum) => {
    const totalPages = getTotalUserPages();
    if (pageNum >= 1 && pageNum <= totalPages) {
      setCurrentUserPage(pageNum);
    }
  };

  const handleUserSearch = () => {
    setCurrentUserPage(1);
    setUserSearch(userSearchInput.trim());
  };

  const handleLogSearch = () => {
    setCurrentLogPage(1);
    setLogDate(logDateInput);
  };

  const handleBan = async (id) => {
    if (!window.confirm('Are you sure you want to ban this user?')) return;
    try {
      const { data: u } = await supabase.from('users').select('id_type, email').eq('id_user', id).maybeSingle();
      if (u?.id_type === 2) { alert('Cannot ban an admin account.'); return; }
      const { error } = await supabase
        .from('users')
        .update({ is_banned: true, suspended_until: null, suspension_reason: 'Manual admin ban' })
        .eq('id_user', id);
      if (error) throw new Error(error.message);
      Promise.resolve(supabase.rpc('write_log', { p_action: 'ADMIN_BAN', p_status: 'Success', p_metadata: { targetEmail: u?.email || null } })).catch(() => {});
      fetchUsers(currentUserPage, userSearch);
    } catch (err) {
      alert('Failed to ban user: ' + err.message);
    }
  };

  const handleUnban = async (id) => {
    try {
      const { data: u } = await supabase.from('users').select('email').eq('id_user', id).maybeSingle();
      const { error } = await supabase
        .from('users')
        .update({ is_banned: false, suspended_until: null, suspension_reason: null })
        .eq('id_user', id);
      if (error) throw new Error(error.message);
      Promise.resolve(supabase.rpc('write_log', { p_action: 'ADMIN_UNBAN', p_status: 'Success', p_metadata: { targetEmail: u?.email || null } })).catch(() => {});
      fetchUsers(currentUserPage, userSearch);
    } catch (err) {
      alert('Failed to unban user: ' + err.message);
    }
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm('Are you sure you want to delete this account? This cannot be undone.')) return;
    try {
      const { data: u } = await supabase.from('users').select('id_type, email').eq('id_user', id).maybeSingle();
      if (u?.id_type === 2) { alert('Cannot delete an admin account.'); return; }
      const { error } = await supabase.from('users').update({ is_deleted: true }).eq('id_user', id);
      if (error) throw new Error(error.message);
      Promise.resolve(supabase.rpc('write_log', { p_action: 'ADMIN_DELETE_ACCOUNT', p_status: 'Success', p_metadata: { targetEmail: u?.email || null } })).catch(() => {});
      fetchUsers(currentUserPage, userSearch);
    } catch (err) {
      alert('Failed to delete account: ' + err.message);
    }
  };

  // Log pagination methods (server-side data; logs state is already the current page)
  const getTotalLogPages = () => {
    return Math.max(1, Math.ceil(logsTotal / logsPerPage));
  };

  const getLogPageNumbers = () => {
    const totalPages = getTotalLogPages();
    const pages = [];
    let startPage = Math.max(1, currentLogPage - 4);
    let endPage = Math.min(totalPages, startPage + 9);
    
    if (endPage - startPage < 9) {
      startPage = Math.max(1, endPage - 9);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    
    return pages;
  };

  const onLogPageChange = (pageNum) => {
    const totalPages = getTotalLogPages();
    if (pageNum >= 1 && pageNum <= totalPages) {
      setCurrentLogPage(pageNum);
    }
  };

  // Requested keywords pagination helpers
  const getTotalRequestPages = () => {
    return Math.max(1, Math.ceil(requestedKeywordsTotal / requestsPerPage));
  };

  const getRequestPageNumbers = () => {
    const totalPages = getTotalRequestPages();
    const pages = [];
    let startPage = Math.max(1, currentRequestPage - 4);
    let endPage = Math.min(totalPages, startPage + 9);
    if (endPage - startPage < 9) {
      startPage = Math.max(1, endPage - 9);
    }
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  };

  const onRequestPageChange = (pageNum) => {
    const totalPages = getTotalRequestPages();
    if (pageNum >= 1 && pageNum <= totalPages) {
      setCurrentRequestPage(pageNum);
    }
  };

  // Keywords table pagination helpers
  const getTotalKeywordPages = () => Math.max(1, Math.ceil(keywordsTotal / keywordsPerPage));

  const getKeywordPageNumbers = () => {
    const totalPages = getTotalKeywordPages();
    const pages = [];
    let startPage = Math.max(1, currentKeywordPage - 4);
    let endPage = Math.min(totalPages, startPage + 9);
    if (endPage - startPage < 9) startPage = Math.max(1, endPage - 9);
    for (let i = startPage; i <= endPage; i++) pages.push(i);
    return pages;
  };

  const onKeywordPageChange = (pageNum) => {
    const totalPages = getTotalKeywordPages();
    if (pageNum >= 1 && pageNum <= totalPages) setCurrentKeywordPage(pageNum);
  };

  const handleKeywordSearch = () => {
    setCurrentKeywordPage(1);
    setKeywordSearch(keywordSearchInput.trim());
  };

  const clearCatalogCache = () => {
    try {
      localStorage.removeItem(CATALOG_CACHE_KEY);
    } catch {
      // Cache invalidation is best-effort only.
    }
  };

  const handleAddKwOpen = () => {
    setNewKeywordName('');
    setNewKeywordSubcategoryId('');
    if (subcategories.length === 0) fetchSubcategories();
    setShowAddKeywordModal(true);
  };

  const handleAddKwSave = async () => {
    const trimmedName = newKeywordName.trim();
    if (!trimmedName) { alert('Keyword name is required.'); return; }
    if (!newKeywordSubcategoryId) { alert('Subcategory is required.'); return; }
    try {
      const { error } = await supabase
        .from('keywords')
        .insert({ name: trimmedName, id_subcategory: parseInt(newKeywordSubcategoryId, 10) });
      if (error) throw new Error(error.message);
      clearCatalogCache();
      Promise.resolve(supabase.rpc('write_log', { p_action: 'ADMIN_ADD_KEYWORD', p_status: 'Success', p_metadata: { keywordName: trimmedName } })).catch(() => {});
      setShowAddKeywordModal(false);
      setKeywordSearchInput('');
      setKeywordSearch('');
      setCurrentKeywordPage(1);
      fetchKeywords(1, '');
    } catch (err) {
      alert('Failed to add keyword: ' + err.message);
    }
  };

  // Edit keyword handlers
  const handleEditKwOpen = (kw) => {
    setEditingKw(kw);
    setEditKwName(kw.name);
    setEditKwSubcategoryId(kw.subcategoryId ? String(kw.subcategoryId) : '');
    if (subcategories.length === 0) fetchSubcategories();
    setShowEditKeywordModal(true);
  };

  const handleEditKwSave = async () => {
    if (!editingKw) return;
    if (!editKwName.trim()) { alert('Keyword name is required.'); return; }
    if (!editKwSubcategoryId) { alert('Subcategory is required.'); return; }
    try {
      const { error } = await supabase
        .from('keywords')
        .update({ name: editKwName.trim(), id_subcategory: parseInt(editKwSubcategoryId) })
        .eq('id_keyword', editingKw.id);
      if (error) throw new Error(error.message);
      clearCatalogCache();
      Promise.resolve(supabase.rpc('write_log', { p_action: 'ADMIN_EDIT_KEYWORD', p_status: 'Success', p_metadata: { keywordId: editingKw.id, oldName: editingKw.name, newName: editKwName.trim() } })).catch(() => {});
      setShowEditKeywordModal(false);
      fetchKeywords(currentKeywordPage, keywordSearch);
    } catch (err) {
      alert('Failed to save keyword: ' + err.message);
    }
  };

  const handleDeleteKeyword = async (id) => {
    if (!window.confirm(`Are you sure you want to permanently delete this keyword? This cannot be undone.`)) return;
    try {
      const kw = keywords.find((k) => k.id === id);
      const { error } = await supabase.from('keywords').delete().eq('id_keyword', id);
      if (error) throw new Error(error.message);
      clearCatalogCache();
      Promise.resolve(supabase.rpc('write_log', { p_action: 'ADMIN_DELETE_KEYWORD', p_status: 'Success', p_metadata: { keywordId: id, keywordName: kw?.name || null } })).catch(() => {});
      fetchKeywords(currentKeywordPage, keywordSearch);
    } catch (err) {
      alert('Failed to delete keyword: ' + err.message);
    }
  };

  // Edit requested keyword modal handlers
  const handleEditOpen = (kw) => {
    setEditingKeyword(kw);
    setEditName(kw.name);
    setEditSubcategoryId(kw.subcategoryId ? String(kw.subcategoryId) : '');
    if (subcategories.length === 0) fetchSubcategories();
    setShowEditModal(true);
  };

  const handleEditSave = async () => {
    if (!editingKeyword) return;
    if (!editName.trim()) {
      alert('Keyword name is required.');
      return;
    }
    try {
      const updates = { name: editName.trim() };
      if (editSubcategoryId !== undefined) updates.id_subcategory = editSubcategoryId ? parseInt(editSubcategoryId) : null;
      const { error } = await supabase
        .from('requested_keywords')
        .update(updates)
        .eq('id', editingKeyword.id);
      if (error) throw new Error(error.message);
      Promise.resolve(supabase.rpc('write_log', { p_action: 'ADMIN_EDIT_REQUESTED_KEYWORD', p_status: 'Success', p_metadata: { requestedKeywordId: editingKeyword.id, oldName: editingKeyword.name, newName: editName.trim() } })).catch(() => {});
      setShowEditModal(false);
      fetchRequestedKeywords(currentRequestPage);
    } catch (err) {
      alert('Failed to save keyword: ' + err.message);
    }
  };

  const handleAccept = async (id) => {
    const kw = requestedKeywords.find((k) => k.id === id);
    if (!kw) return;
    if (!kw.name || !kw.name.trim()) { alert('Keyword name is required.'); return; }
    if (!kw.subcategoryId) { alert('Please select a subcategory before accepting.'); return; }
    try {
      const { error } = await supabase.rpc('accept_requested_keyword', { p_id: id });
      if (error) throw new Error(error.message);
      clearCatalogCache();
      Promise.resolve(supabase.rpc('write_log', { p_action: 'ADMIN_ACCEPT_KEYWORD', p_status: 'Success', p_metadata: { requestedKeywordId: id, keywordName: kw.name } })).catch(() => {});
      fetchRequestedKeywords(currentRequestPage);
      fetchKeywords(currentKeywordPage, keywordSearch);
    } catch (err) {
      alert('Failed to accept keyword: ' + err.message);
    }
  };

  const handleUnaccept = async (id) => {
    if (!window.confirm('Are you sure you want to dismiss this keyword request?')) return;
    try {
      const kw = requestedKeywords.find((k) => k.id === id);
      const { error } = await supabase
        .from('requested_keywords')
        .update({ is_disabled: true })
        .eq('id', id);
      if (error) throw new Error(error.message);
      Promise.resolve(supabase.rpc('write_log', { p_action: 'ADMIN_DISMISS_KEYWORD', p_status: 'Success', p_metadata: { requestedKeywordId: id, keywordName: kw?.name || null } })).catch(() => {});
      fetchRequestedKeywords(currentRequestPage);
    } catch (err) {
      alert('Failed to dismiss keyword request: ' + err.message);
    }
  };

  return (
    <div className="container mt-5">
      <select 
        className="form-select mb-5" 
        aria-label="Page selector"
        value={page}
        onChange={(e) => setPage(parseInt(e.target.value))}
      >
        <option value={0}>Dashboard</option>
        <option value={1}>Users</option>
        <option value={2}>Keywords</option>
        <option value={3}>Logs</option>
      </select>

      {/* Dashboard Tab */}
      {page === 0 && (
        <>
          <div className="row mb-4">
            <div className="col-12 d-flex justify-content-end">
              <div className="form-group">
                <label htmlFor="yearSelect" className="me-2"><strong>Select Year:</strong></label>
                <select 
                  id="yearSelect" 
                  className="form-select d-inline-block w-auto"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                >
                  <option value={2026}>2026</option>
                  <option value={2027}>2027</option>
                  <option value={2028}>2028</option>
                </select>
              </div>
            </div>
          </div>

          {statsError && !statsChartData ? (
            <div className="alert alert-danger">Failed to load statistics: {statsError}</div>
          ) : (
          <>
          <div className="row mb-4">
            <div className="col-md-6 mb-4 mb-md-0">
              <div className="card h-100">
                <div className="card-body">
                  <h2 className="card-title">Revenue</h2>
                  <h4 className="card-text mb-3">Total ({selectedYear}): €{getTotalRendimento().toLocaleString('pt-PT')}</h4>
                  <div style={{ height: '250px' }}>
                    <canvas ref={rendimentoChartRef}></canvas>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-md-6">
              <div className="card h-100">
                <div className="card-body">
                  <h2 className="card-title">Payments</h2>
                  <h4 className="card-text mb-3">Total ({selectedYear}): {getTotalPagamentos()}</h4>
                  <div style={{ height: '250px' }}>
                    <canvas ref={pagamentosChartRef}></canvas>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="row mb-5">
            <div className="col-md-12 mb-4 mb-md-0">
              <div className="card h-100">
                <div className="card-body">
                  <h2 className="card-title">Users</h2>
                  <h4 className="card-text mb-3">Total ({selectedYear}): {getTotalUtilizadores().toLocaleString('pt-PT')}</h4>
                  <div style={{ height: '250px' }}>
                    <canvas ref={utilizadoresChartRef}></canvas>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </>
          )}
        </>
      )}

      {/* Users Tab */}
      {page === 1 && (
        <>
          <div className="d-flex justify-content-end mb-4">
            <div className="input-group" style={{ minWidth: '380px', maxWidth: '380px' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Enter user name or email"
                value={userSearchInput}
                onChange={(e) => setUserSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleUserSearch(); }}
              />
              <button type="button" className="btn btn-primary" onClick={handleUserSearch}>Search</button>
            </div>
          </div>

          {usersLoading ? (
            <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '200px' }}>
              <div className="spinner-border spinner-primary" role="status">
                <span className="visually-hidden">Loading users...</span>
              </div>
            </div>
          ) : usersError ? (
            <div className="alert alert-danger">Failed to load users: {usersError}</div>
          ) : (
          <>
          <table className="table table-striped align-middle text-center">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Status</th>
                <th scope="col"></th>
                <th scope="col"></th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={6} className="text-muted">No users found.</td></tr>
              ) : (
                users.map((user) => (
                  <tr key={user.supabaseUid}>
                    <td>{user.name || '-'}</td>
                    <td>{user.email}</td>
                    <td style={{ color: user.isBanned || user.isSuspended ? 'red' : 'green' }}>
                      {user.isBanned
                        ? 'Banned'
                        : user.isSuspended
                          ? `Suspended until ${user.suspendedUntil.toLocaleString('en-GB')}`
                          : 'Active'}
                      {user.violationCount > 0 && (
                        <small className="d-block text-muted">Violations: {user.violationCount}</small>
                      )}
                    </td>
                    <td>
                      {user.plan && (
                        <button className="btn btn-danger btn-sm">CANCEL BASIC PLAN</button>
                      )}
                    </td>
                    <td>
                      {!user.isAdmin && (
                        user.isBanned || user.isSuspended ? (
                          <button className="btn btn-danger btn-sm" onClick={() => handleUnban(user.id)}>UNSUSPEND</button>
                        ) : (
                          <button className="btn btn-danger btn-sm" onClick={() => handleBan(user.id)}>BAN</button>
                        )
                      )}
                    </td>
                    <td>
                      {!user.isAdmin && (
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeleteUser(user.id)}>DELETE ACCOUNT</button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <nav aria-label="User pagination">
            <ul className="pagination justify-content-center mt-5 mb-5">
              <li className={`page-item ${currentUserPage === 1 ? 'disabled' : ''}`}>
                <a
                  className="page-link"
                  onClick={() => onUserPageChange(currentUserPage - 1)}
                  style={{ cursor: 'pointer' }}
                >
                  Previous
                </a>
              </li>
              {getUserPageNumbers().map((pageNum) => (
                <li
                  key={pageNum}
                  className={`page-item ${pageNum === currentUserPage ? 'active' : ''}`}
                >
                  <a
                    className="page-link"
                    onClick={() => onUserPageChange(pageNum)}
                    style={{ cursor: 'pointer' }}
                  >
                    {pageNum}
                  </a>
                </li>
              ))}
              <li className={`page-item ${currentUserPage === getTotalUserPages() ? 'disabled' : ''}`}>
                <a
                  className="page-link"
                  onClick={() => onUserPageChange(currentUserPage + 1)}
                  style={{ cursor: 'pointer' }}
                >
                  Next
                </a>
              </li>
            </ul>
          </nav>
          </>
          )}
        </>
      )}

      {/* Logs Tab */}
      {page === 3 && (
        <>
          <div className="d-flex justify-content-end mb-4">
            <div className="input-group" style={{ minWidth: '560px', maxWidth: '560px' }}>
              <select
                className="form-select"
                value={logActionId}
                onChange={(e) => { setLogActionId(e.target.value); setCurrentLogPage(1); }}
              >
                <option value="">All actions</option>
                {logActions.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <input
                type="date"
                className="form-control"
                value={logDateInput}
                onChange={(e) => setLogDateInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleLogSearch(); }}
              />
              <button type="button" className="btn btn-primary" onClick={handleLogSearch}>Search</button>
            </div>
          </div>

          {logsLoading ? (
            <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '200px' }}>
              <div className="spinner-border spinner-primary" role="status">
                <span className="visually-hidden">Loading logs...</span>
              </div>
            </div>
          ) : logsError ? (
            <div className="alert alert-danger">Failed to load logs: {logsError}</div>
          ) : (
          <>
          <table className="table table-striped align-middle text-center">
            <thead>
              <tr>
                <th scope="col">User</th>
                <th scope="col">IP</th>
                <th scope="col">Action</th>
                <th scope="col">Status</th>
                <th scope="col">Details</th>
                <th scope="col">Date</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={6} className="text-muted">No logs found.</td></tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td>{log.user}</td>
                    <td>{log.ip}</td>
                    <td>{log.action}</td>
                    <td style={{ color: log.statusColor }}>{log.status}</td>
                    <td>{log.reason || '-'}</td>
                    <td>{log.date}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <nav aria-label="Log pagination">
            <ul className="pagination justify-content-center mt-5 mb-5">
              <li className={`page-item ${currentLogPage === 1 ? 'disabled' : ''}`}>
                <a
                  className="page-link"
                  onClick={() => onLogPageChange(currentLogPage - 1)}
                  style={{ cursor: 'pointer' }}
                >
                  Previous
                </a>
              </li>
              {getLogPageNumbers().map((pageNum) => (
                <li
                  key={pageNum}
                  className={`page-item ${pageNum === currentLogPage ? 'active' : ''}`}
                >
                  <a
                    className="page-link"
                    onClick={() => onLogPageChange(pageNum)}
                    style={{ cursor: 'pointer' }}
                  >
                    {pageNum}
                  </a>
                </li>
              ))}
              <li className={`page-item ${currentLogPage === getTotalLogPages() ? 'disabled' : ''}`}>
                <a
                  className="page-link"
                  onClick={() => onLogPageChange(currentLogPage + 1)}
                  style={{ cursor: 'pointer' }}
                >
                  Next
                </a>
              </li>
            </ul>
          </nav>
          </>
          )}
        </>
      )}

      {/* Keywords Tab */}
      {page === 2 && (
        <>
          {requestedKeywordsLoading ? (
            <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '200px' }}>
              <div className="spinner-border spinner-primary" role="status">
                <span className="visually-hidden">Loading keyword requests...</span>
              </div>
            </div>
          ) : requestedKeywordsError ? (
            <div className="alert alert-danger">Failed to load keyword requests: {requestedKeywordsError}</div>
          ) : (
          <>
          <table className="table table-striped align-middle text-center">
            <thead>
              <tr>
                <th scope="col">Keyword</th>
                <th scope="col">Subcategory</th>
                <th scope="col">Request Amounts</th>
                <th scope="col"></th>
                <th scope="col"></th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {requestedKeywords.length === 0 ? (
                <tr><td colSpan={6} className="text-muted">No keyword requests found.</td></tr>
              ) : (
                requestedKeywords.map((kw) => (
                  <tr key={kw.id}>
                    <td>{kw.name}</td>
                    <td>{kw.subcategoryName || '-'}</td>
                    <td>{kw.requestAmount}</td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleEditOpen(kw)}>Edit</button>
                    </td>
                    <td>
                      <button className="btn btn-success btn-sm" onClick={() => handleAccept(kw.id)}>Accept</button>
                    </td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => handleUnaccept(kw.id)}>Dismiss</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <nav aria-label="Keyword request pagination">
            <ul className="pagination justify-content-center mt-5 mb-5">
              <li className={`page-item ${currentRequestPage === 1 ? 'disabled' : ''}`}>
                <a
                  className="page-link"
                  onClick={() => onRequestPageChange(currentRequestPage - 1)}
                  style={{ cursor: 'pointer' }}
                >
                  Previous
                </a>
              </li>
              {getRequestPageNumbers().map((pageNum) => (
                <li
                  key={pageNum}
                  className={`page-item ${pageNum === currentRequestPage ? 'active' : ''}`}
                >
                  <a
                    className="page-link"
                    onClick={() => onRequestPageChange(pageNum)}
                    style={{ cursor: 'pointer' }}
                  >
                    {pageNum}
                  </a>
                </li>
              ))}
              <li className={`page-item ${currentRequestPage === getTotalRequestPages() ? 'disabled' : ''}`}>
                <a
                  className="page-link"
                  onClick={() => onRequestPageChange(currentRequestPage + 1)}
                  style={{ cursor: 'pointer' }}
                >
                  Next
                </a>
              </li>
            </ul>
          </nav>
          </>
          )}

          {/* Keywords Table */}
          <div className="d-flex justify-content-end align-items-center gap-3 mt-5 mb-4">
            <div className="input-group" style={{ minWidth: '380px', maxWidth: '380px' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Search keywords..."
                value={keywordSearchInput}
                onChange={(e) => setKeywordSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleKeywordSearch(); }}
              />
              <button type="button" className="btn btn-primary" onClick={handleKeywordSearch}>Search</button>
            </div>
            <button
              type="button"
              className="btn text-white"
              style={{ backgroundColor: '#6f42c1', borderColor: '#6f42c1' }}
              onClick={handleAddKwOpen}
            >
              Add Keyword
            </button>
          </div>

          {keywordsLoading ? (
            <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '200px' }}>
              <div className="spinner-border spinner-primary" role="status">
                <span className="visually-hidden">Loading keywords...</span>
              </div>
            </div>
          ) : keywordsError ? (
            <div className="alert alert-danger">Failed to load keywords: {keywordsError}</div>
          ) : (
          <>
          <table className="table table-striped align-middle text-center">
            <thead>
              <tr>
                <th scope="col">Keyword</th>
                <th scope="col">Subcategory</th>
                <th scope="col"></th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {keywords.length === 0 ? (
                <tr><td colSpan={4} className="text-muted">No keywords found.</td></tr>
              ) : (
                keywords.map((kw) => (
                  <tr key={kw.id}>
                    <td>{kw.name}</td>
                    <td>{kw.subcategoryName ? `${kw.categoryName} › ${kw.subcategoryName}` : '-'}</td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleEditKwOpen(kw)}>Edit</button>
                    </td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteKeyword(kw.id)}>Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <nav aria-label="Keywords pagination">
            <ul className="pagination justify-content-center mt-5 mb-5">
              <li className={`page-item ${currentKeywordPage === 1 ? 'disabled' : ''}`}>
                <a className="page-link" onClick={() => onKeywordPageChange(currentKeywordPage - 1)} style={{ cursor: 'pointer' }}>Previous</a>
              </li>
              {getKeywordPageNumbers().map((pageNum) => (
                <li key={pageNum} className={`page-item ${pageNum === currentKeywordPage ? 'active' : ''}`}>
                  <a className="page-link" onClick={() => onKeywordPageChange(pageNum)} style={{ cursor: 'pointer' }}>{pageNum}</a>
                </li>
              ))}
              <li className={`page-item ${currentKeywordPage === getTotalKeywordPages() ? 'disabled' : ''}`}>
                <a className="page-link" onClick={() => onKeywordPageChange(currentKeywordPage + 1)} style={{ cursor: 'pointer' }}>Next</a>
              </li>
            </ul>
          </nav>
          </>
          )}
        </>
      )}

      {/* Add Keyword Modal */}
      {showAddKeywordModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Add Keyword</h5>
                <button type="button" className="btn-close" onClick={() => setShowAddKeywordModal(false)}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">Keyword Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={newKeywordName}
                    onChange={(e) => setNewKeywordName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddKwSave(); }}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Subcategory</label>
                  <select
                    className="form-select"
                    value={newKeywordSubcategoryId}
                    onChange={(e) => setNewKeywordSubcategoryId(e.target.value)}
                  >
                    <option value="">-- Select a subcategory --</option>
                    {subcategories.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.categoryName} › {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowAddKeywordModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleAddKwSave}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Requested Keyword Modal */}
      {showEditModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Edit Requested Keyword</h5>
                <button type="button" className="btn-close" onClick={() => setShowEditModal(false)}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">Keyword Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Subcategory</label>
                  <select
                    className="form-select"
                    value={editSubcategoryId}
                    onChange={(e) => setEditSubcategoryId(e.target.value)}
                  >
                    <option value="">-- Select a subcategory --</option>
                    {subcategories.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.categoryName} › {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleEditSave}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Keyword Modal */}
      {showEditKeywordModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Edit Keyword</h5>
                <button type="button" className="btn-close" onClick={() => setShowEditKeywordModal(false)}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">Keyword Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editKwName}
                    onChange={(e) => setEditKwName(e.target.value)}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Subcategory</label>
                  <select
                    className="form-select"
                    value={editKwSubcategoryId}
                    onChange={(e) => setEditKwSubcategoryId(e.target.value)}
                  >
                    <option value="">-- Select a subcategory --</option>
                    {subcategories.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.categoryName} › {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowEditKeywordModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleEditKwSave}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Admin;
