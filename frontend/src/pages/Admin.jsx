import { useState, useEffect, useRef, useCallback } from 'react';
import { Chart, registerables } from 'chart.js';
import { supabase } from '../lib/supabaseClient';
import {
  BULK_EMAIL_BODY_MAX_LENGTH,
  BULK_EMAIL_CTA_LABEL_MAX_LENGTH,
  BULK_EMAIL_CTA_URL_MAX_LENGTH,
  BULK_EMAIL_HEADING_MAX_LENGTH,
  BULK_EMAIL_PREVIEW_MAX_LENGTH,
  BULK_EMAIL_SUBJECT_MAX_LENGTH,
  createSiteNotification,
  editDrawEvent,
  mapAdminDrawEvent,
  NOTIFICATION_BODY_MAX_LENGTH,
  NOTIFICATION_TITLE_MAX_LENGTH,
  sendDrawEventEmail,
  sendBulkUserEmail,
  SITE_NOTIFICATION_DELIVERY_SCOPES,
  uploadNotificationCover,
} from '../lib/notificationService';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DELETE_ACCOUNT_ACTIONS = ['DELETE_ACCOUNT', 'ADMIN_DELETE_ACCOUNT'];
const DASHBOARD_START_YEAR = 2026;
const ADMIN_MOBILE_PAGINATION_QUERY = '(max-width: 575.98px)';
const ADMIN_TABLET_PAGINATION_QUERY = '(max-width: 991.98px)';
const DESKTOP_MAX_PAGINATION_PAGES = 10;
const TABLET_MAX_PAGINATION_PAGES = 4;
const MOBILE_MAX_PAGINATION_PAGES = 2;
const sanitizePostgrestOrTerm = (value) => value.replace(/[%,()]/g, ' ').trim();
const CATALOG_CACHE_KEY = 'lfp_catalog';
const getAdminMaxPaginationPages = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return DESKTOP_MAX_PAGINATION_PAGES;
  }

  if (window.matchMedia(ADMIN_MOBILE_PAGINATION_QUERY).matches) {
    return MOBILE_MAX_PAGINATION_PAGES;
  }

  if (window.matchMedia(ADMIN_TABLET_PAGINATION_QUERY).matches) {
    return TABLET_MAX_PAGINATION_PAGES;
  }

  return DESKTOP_MAX_PAGINATION_PAGES;
};
const getCurrentDashboardYear = () => Math.max(DASHBOARD_START_YEAR, new Date().getFullYear());
const getDashboardYearOptions = () => (
  Array.from(
    { length: getCurrentDashboardYear() - DASHBOARD_START_YEAR + 1 },
    (_, index) => DASHBOARD_START_YEAR + index
  )
);
const getPaginationPageNumbers = (currentPage, totalPages, maxVisiblePages) => {
  const visiblePages = Math.min(totalPages, maxVisiblePages);
  const pages = [];
  const pagesBeforeCurrent = Math.floor((visiblePages - 1) / 2);
  let startPage = Math.max(1, currentPage - pagesBeforeCurrent);
  let endPage = Math.min(totalPages, startPage + visiblePages - 1);

  if (endPage - startPage + 1 < visiblePages) {
    startPage = Math.max(1, endPage - visiblePages + 1);
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  return pages;
};

const getRelatedRow = (value) => Array.isArray(value) ? value[0] : value;

const getLogMetadata = (metadata) => (
  metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}
);

const formatList = (items) => (
  (Array.isArray(items) ? items : [])
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .join(', ')
);

const formatLogUser = (row) => {
  const user = getRelatedRow(row.users);
  const metadata = getLogMetadata(row.metadata);

  if (row.id_user && (!user || user.is_deleted)) return 'Deleted Account';
  return user?.email || metadata.targetEmail || 'Anonymous';
};

const formatLogAction = (row) => {
  const action = getRelatedRow(row.actions);
  const metadata = getLogMetadata(row.metadata);
  const name = action?.name || metadata.action || metadata.actionName;

  if (name) return String(name);
  return row.id_action ? `Action #${row.id_action}` : 'Unknown Action';
};

const formatLogDetails = (row) => {
  const metadata = getLogMetadata(row.metadata);
  const keywordNames = formatList(metadata.keywordNames);
  const keywordIds = formatList(metadata.keywordIds);
  const reason = String(row.reason || '').trim();

  if (keywordNames) return keywordNames;
  if (keywordIds) return `Keyword IDs: ${keywordIds}`;
  if (reason) return reason;
  if (metadata.targetEmail) return metadata.targetEmail;
  if (metadata.subject) return `Subject: ${metadata.subject}`;
  if (metadata.title) return `Title: ${metadata.title}`;
  if (metadata.newTitle || metadata.oldTitle) {
    return [metadata.oldTitle, metadata.newTitle].filter(Boolean).join(' -> ');
  }
  if (metadata.keywordName) return metadata.keywordName;
  if (metadata.newName || metadata.oldName) {
    return [metadata.oldName, metadata.newName].filter(Boolean).join(' -> ');
  }
  if (metadata.drawEventId) return `Draw Event #${metadata.drawEventId}`;
  if (metadata.notificationId) return `Notification #${metadata.notificationId}`;

  return '';
};

function Admin() {
  const [page, setPage] = useState(0);
  const [selectedYear, setSelectedYear] = useState(() => getCurrentDashboardYear());
  const [currentUserPage, setCurrentUserPage] = useState(1);
  const [currentLogPage, setCurrentLogPage] = useState(1);
  const [maxPaginationPages, setMaxPaginationPages] = useState(() => getAdminMaxPaginationPages());

  const utilizadoresChartRef = useRef(null);
  const visitsChartRef = useRef(null);
  const rendimentoChartRef = useRef(null);
  const pagamentosChartRef = useRef(null);

  const chartInstancesRef = useRef({
    utilizadores: null,
    visits: null,
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
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventBody, setEventBody] = useState('');
  const [eventCoverFile, setEventCoverFile] = useState(null);
  const [eventCoverPreview, setEventCoverPreview] = useState('');
  const [eventIsDrawEvent, setEventIsDrawEvent] = useState(false);
  const [eventDeliveryScope, setEventDeliveryScope] = useState(SITE_NOTIFICATION_DELIVERY_SCOPES.CURRENT_USERS);
  const [eventSending, setEventSending] = useState(false);
  const [eventError, setEventError] = useState('');

  // Draw event notifications state
  const [drawEvents, setDrawEvents] = useState([]);
  const [drawEventsLoading, setDrawEventsLoading] = useState(false);
  const [drawEventsError, setDrawEventsError] = useState(null);
  const [showEditDrawEventModal, setShowEditDrawEventModal] = useState(false);
  const [editingDrawEvent, setEditingDrawEvent] = useState(null);
  const [editDrawEventTitle, setEditDrawEventTitle] = useState('');
  const [editDrawEventBody, setEditDrawEventBody] = useState('');
  const [editDrawEventCoverUrl, setEditDrawEventCoverUrl] = useState('');
  const [editDrawEventCoverFile, setEditDrawEventCoverFile] = useState(null);
  const [editDrawEventCoverPreview, setEditDrawEventCoverPreview] = useState('');
  const [editDrawEventDeliveryScope, setEditDrawEventDeliveryScope] = useState(SITE_NOTIFICATION_DELIVERY_SCOPES.CURRENT_USERS);
  const [editDrawEventSaving, setEditDrawEventSaving] = useState(false);
  const [editDrawEventError, setEditDrawEventError] = useState('');

  // Bulk email state
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailPreview, setEmailPreview] = useState('');
  const [emailHeading, setEmailHeading] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailCtaLabel, setEmailCtaLabel] = useState('');
  const [emailCtaUrl, setEmailCtaUrl] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState('');

  const createCharts = useCallback(() => {
    Object.values(chartInstancesRef.current).forEach((chart) => {
      if (chart) chart.destroy();
    });

    if (!statsChartData) return;

    const gridColor = 'rgba(15, 23, 42, 0.08)';
    const labelColor = '#475569';
    const baseOptions = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          onClick: () => {},
          labels: {
            boxWidth: 12,
            boxHeight: 12,
            color: labelColor,
            usePointStyle: true
          }
        },
        tooltip: {
          backgroundColor: '#111827',
          borderColor: 'rgba(255,255,255,0.16)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: (context) => {
              const rawValue = Number(context.raw || 0);
              const value = context.dataset.label === 'Users left' ? Math.abs(rawValue) : rawValue;
              return `${context.dataset.label}: ${value.toLocaleString('pt-PT')}`;
            }
          }
        }
      }
    };
    const lineDataset = ({ label, data, color, fillColor, yAxisID, order = 1 }) => ({
      type: 'line',
      label,
      data,
      borderColor: color,
      backgroundColor: fillColor,
      borderWidth: 3,
      pointBackgroundColor: color,
      pointBorderColor: '#ffffff',
      pointBorderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6,
      tension: 0.35,
      fill: true,
      yAxisID,
      order
    });
    const blueLine = {
      color: '#0284c7',
      fillColor: 'rgba(14, 165, 233, 0.12)'
    };
    const purpleLine = {
      color: '#6D28D9',
      fillColor: 'rgba(109, 40, 217, 0.1)'
    };
    const redLine = {
      color: '#dc2626',
      fillColor: 'rgba(239, 68, 68, 0.1)'
    };
    const greenLine = {
      color: '#16a34a',
      fillColor: 'rgba(34, 197, 94, 0.1)'
    };
    const yellowLine = {
      color: '#ca8a04',
      fillColor: 'rgba(234, 179, 8, 0.1)'
    };

    if (utilizadoresChartRef.current) {
      const ctx = utilizadoresChartRef.current.getContext('2d');
      chartInstancesRef.current.utilizadores = new Chart(ctx, {
        type: 'line',
        data: {
          labels: MONTH_LABELS,
          datasets: [
            lineDataset({
              label: 'Active users',
              data: statsChartData.users.active,
              color: purpleLine.color,
              fillColor: purpleLine.fillColor,
              yAxisID: 'users',
              order: 1
            }),
            lineDataset({
              label: 'New users',
              data: statsChartData.users.new,
              color: blueLine.color,
              fillColor: blueLine.fillColor,
              yAxisID: 'users',
              order: 2
            }),
            lineDataset({
              label: 'Users left',
              data: statsChartData.users.left,
              color: redLine.color,
              fillColor: redLine.fillColor,
              yAxisID: 'users',
              order: 2
            })
          ]
        },
        options: {
          ...baseOptions,
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: labelColor }
            },
            users: {
              position: 'left',
              beginAtZero: true,
              grid: { color: gridColor },
              ticks: {
                color: labelColor,
                precision: 0
              }
            }
          }
        }
      });
    }

    if (visitsChartRef.current) {
      const ctx = visitsChartRef.current.getContext('2d');
      chartInstancesRef.current.visits = new Chart(ctx, {
        type: 'line',
        data: {
          labels: MONTH_LABELS,
          datasets: [
            lineDataset({
              label: 'Total views',
              data: statsChartData.visits.totalCumulative,
              color: purpleLine.color,
              fillColor: purpleLine.fillColor,
              yAxisID: 'views',
              order: 1
            }),
            lineDataset({
              label: 'Monthly views',
              data: statsChartData.visits.total,
              color: blueLine.color,
              fillColor: blueLine.fillColor,
              yAxisID: 'views',
              order: 2
            }),
            lineDataset({
              label: 'Total unique views',
              data: statsChartData.visits.uniqueCumulative,
              color: greenLine.color,
              fillColor: greenLine.fillColor,
              yAxisID: 'views',
              order: 3
            }),
            lineDataset({
              label: 'Monthly unique views',
              data: statsChartData.visits.unique,
              color: yellowLine.color,
              fillColor: yellowLine.fillColor,
              yAxisID: 'views',
              order: 4
            })
          ]
        },
        options: {
          ...baseOptions,
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: labelColor }
            },
            views: {
              beginAtZero: true,
              grid: { color: gridColor },
              ticks: {
                color: labelColor,
                precision: 0
              }
            }
          }
        }
      });
    }

    if (rendimentoChartRef.current) {
      const ctx = rendimentoChartRef.current.getContext('2d');
      chartInstancesRef.current.rendimento = new Chart(ctx, {
        type: 'line',
        data: {
          labels: MONTH_LABELS,
          datasets: [
            lineDataset({
              label: 'Total revenue',
              data: statsChartData.revenueCumulative,
              color: purpleLine.color,
              fillColor: purpleLine.fillColor,
              yAxisID: 'money',
              order: 1
            }),
            lineDataset({
              label: 'Monthly revenue',
              data: statsChartData.revenue,
              color: blueLine.color,
              fillColor: blueLine.fillColor,
              yAxisID: 'money',
              order: 2
            })
          ]
        },
        options: {
          ...baseOptions,
          plugins: {
            ...baseOptions.plugins,
            tooltip: {
              ...baseOptions.plugins.tooltip,
              callbacks: {
                label: (context) => `${context.dataset.label}: €${Number(context.raw || 0).toLocaleString('pt-PT')}`
              }
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: labelColor }
            },
            money: {
              beginAtZero: true,
              grid: { color: gridColor },
              ticks: {
                color: labelColor,
                callback: function(value) {
                  return '€' + Number(value).toLocaleString('pt-PT');
                }
              }
            }
          }
        }
      });
    }

    if (pagamentosChartRef.current) {
      const ctx = pagamentosChartRef.current.getContext('2d');
      chartInstancesRef.current.pagamentos = new Chart(ctx, {
        type: 'line',
        data: {
          labels: MONTH_LABELS,
          datasets: [
            lineDataset({
              label: 'Total payments',
              data: statsChartData.paymentsCumulative,
              color: purpleLine.color,
              fillColor: purpleLine.fillColor,
              yAxisID: 'payments',
              order: 1
            }),
            lineDataset({
              label: 'Monthly payments',
              data: statsChartData.payments,
              color: blueLine.color,
              fillColor: blueLine.fillColor,
              yAxisID: 'payments',
              order: 2
            })
          ]
        },
        options: {
          ...baseOptions,
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: labelColor }
            },
            payments: {
              beginAtZero: true,
              grid: { color: gridColor },
              ticks: {
                color: labelColor,
                precision: 0,
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
        .select('id_log, id_user, id_action, status, reason, ip, metadata, created_at, users(email, is_deleted), actions(name)');
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
        user:        formatLogUser(r),
        ip:          r.ip || '-',
        action:      formatLogAction(r),
        status:      r.status,
        statusColor: r.status === 'Success' ? 'green' : r.status === 'Error' ? 'red' : 'orange',
        details:     formatLogDetails(r),
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
      const [statsResult, usersResult, priorCreatedResult, visitStatsResult] = await Promise.all([
        supabase.from('monthly_stats').select('month, revenue, payments').eq('year', year),
        supabase.from('users').select('created_at').gte('created_at', yearStart).lt('created_at', yearEnd),
        supabase.from('users').select('*', { count: 'exact', head: true }).lt('created_at', yearStart),
        supabase.rpc('get_site_visit_stats', { p_year: year }),
      ]);
      if (statsResult.error) throw new Error(statsResult.error.message);
      if (usersResult.error) throw new Error(usersResult.error.message);
      if (priorCreatedResult.error) throw new Error(priorCreatedResult.error.message);

      const newPerMonth = Array(12).fill(0);
      for (const u of usersResult.data || []) {
        const m = new Date(u.created_at).getUTCMonth();
        newPerMonth[m]++;
      }

      const leftPerMonth = Array(12).fill(0);
      let priorDepartures = 0;
      const [deletedRowsResult, priorDeletedResult] = await Promise.all([
        supabase
          .from('users')
          .select('deleted_at')
          .not('deleted_at', 'is', null)
          .gte('deleted_at', yearStart)
          .lt('deleted_at', yearEnd),
        supabase
          .from('users')
          .select('deleted_at', { count: 'exact', head: true })
          .not('deleted_at', 'is', null)
          .lt('deleted_at', yearStart),
      ]);

      if (!deletedRowsResult.error && !priorDeletedResult.error) {
        for (const user of deletedRowsResult.data || []) {
          const m = new Date(user.deleted_at).getUTCMonth();
          leftPerMonth[m]++;
        }
        priorDepartures = priorDeletedResult.count || 0;
      } else {
        const [departureLogsResult, priorDeparturesResult] = await Promise.all([
          supabase
            .from('logs')
            .select('created_at, actions!inner(name)')
            .eq('status', 'Success')
            .gte('created_at', yearStart)
            .lt('created_at', yearEnd)
            .in('actions.name', DELETE_ACCOUNT_ACTIONS),
          supabase
            .from('logs')
            .select('actions!inner(name)', { count: 'exact', head: true })
            .eq('status', 'Success')
            .lt('created_at', yearStart)
            .in('actions.name', DELETE_ACCOUNT_ACTIONS),
        ]);
        if (departureLogsResult.error) throw new Error(departureLogsResult.error.message);
        if (priorDeparturesResult.error) throw new Error(priorDeparturesResult.error.message);
        for (const log of departureLogsResult.data || []) {
          const m = new Date(log.created_at).getUTCMonth();
          leftPerMonth[m]++;
        }
        priorDepartures = priorDeparturesResult.count || 0;
      }

      const netPerMonth = newPerMonth.map((newUsers, i) => newUsers - leftPerMonth[i]);
      let runningUsers = Math.max(0, (priorCreatedResult.count || 0) - priorDepartures);
      const activeUsers = netPerMonth.map((net) => {
        runningUsers = Math.max(0, runningUsers + net);
        return runningUsers;
      });

      const visits = {
        total: Array(12).fill(0),
        unique: Array(12).fill(0),
      };
      if (!visitStatsResult.error) {
        for (const row of visitStatsResult.data || []) {
          const index = Number(row.month) - 1;
          if (index >= 0 && index < 12) {
            visits.total[index] = Number(row.total_views || 0);
            visits.unique[index] = Number(row.unique_views || 0);
          }
        }
      }
      visits.totalCumulative = visits.total.map((sum => (value) => (sum += value))(0));
      visits.uniqueCumulative = visits.unique.map((sum => (value) => (sum += value))(0));

      const statsMap = Object.fromEntries((statsResult.data || []).map((s) => [s.month, s]));
      const revenue  = Array.from({ length: 12 }, (_, i) => Number(statsMap[i + 1]?.revenue  ?? 0));
      const payments = Array.from({ length: 12 }, (_, i) => Number(statsMap[i + 1]?.payments ?? 0));
      const revenueCumulative = revenue.map((sum => (value) => (sum += value))(0));
      const paymentsCumulative = payments.map((sum => (value) => (sum += value))(0));

      setStatsChartData({
        year,
        users: {
          new: newPerMonth,
          left: leftPerMonth,
          net: netPerMonth,
          active: activeUsers,
        },
        visits,
        revenue,
        revenueCumulative,
        payments,
        paymentsCumulative,
      });
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

  const fetchDrawEvents = useCallback(async () => {
    setDrawEventsLoading(true);
    setDrawEventsError(null);
    try {
      const { data, error } = await supabase.rpc('list_admin_draw_events');
      if (error) throw new Error(error.message);
      setDrawEvents((data || []).map(mapAdminDrawEvent).filter(Boolean));
    } catch (err) {
      setDrawEventsError(err.message);
    } finally {
      setDrawEventsLoading(false);
    }
  }, []);

  // Fetch statistics whenever the Statistics tab is active or year changes
  useEffect(() => {
    if (page === 0) {
      fetchStats(selectedYear);
    }
  }, [page, selectedYear, fetchStats]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;

    const mobileQuery = window.matchMedia(ADMIN_MOBILE_PAGINATION_QUERY);
    const tabletQuery = window.matchMedia(ADMIN_TABLET_PAGINATION_QUERY);
    const handleChange = () => setMaxPaginationPages(getAdminMaxPaginationPages());

    handleChange();
    mobileQuery.addEventListener('change', handleChange);
    tabletQuery.addEventListener('change', handleChange);

    return () => {
      mobileQuery.removeEventListener('change', handleChange);
      tabletQuery.removeEventListener('change', handleChange);
    };
  }, []);

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

  // Fetch requested keywords whenever the Requests tab is active or request page changes
  useEffect(() => {
    if (page === 4) {
      fetchRequestedKeywords(currentRequestPage);
    }
  }, [page, currentRequestPage, fetchRequestedKeywords]);

  // Fetch draw events whenever the Notifications tab is active
  useEffect(() => {
    if (page === 5) {
      fetchDrawEvents();
    }
  }, [page, fetchDrawEvents]);

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
    const visitsChart = chartInstancesRef.current.visits;
    const rendimentoChart = chartInstancesRef.current.rendimento;
    const pagamentosChart = chartInstancesRef.current.pagamentos;

    // Cleanup function to destroy charts on unmount or before recreation
    return () => {
      if (utilizadoresChart) utilizadoresChart.destroy();
      if (visitsChart) visitsChart.destroy();
      if (rendimentoChart) rendimentoChart.destroy();
      if (pagamentosChart) pagamentosChart.destroy();
    };
  }, [createCharts, page]);

  useEffect(() => {
    return () => {
      if (eventCoverPreview.startsWith('blob:')) {
        URL.revokeObjectURL(eventCoverPreview);
      }
    };
  }, [eventCoverPreview]);

  useEffect(() => {
    return () => {
      if (editDrawEventCoverPreview.startsWith('blob:')) {
        URL.revokeObjectURL(editDrawEventCoverPreview);
      }
    };
  }, [editDrawEventCoverPreview]);

  // User pagination methods (server-side)
  const getTotalUserPages = () => {
    return Math.max(1, Math.ceil(usersTotal / usersPerPage));
  };

  const getUserPageNumbers = () => {
    return getPaginationPageNumbers(currentUserPage, getTotalUserPages(), maxPaginationPages);
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
    return getPaginationPageNumbers(currentLogPage, getTotalLogPages(), maxPaginationPages);
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
    return getPaginationPageNumbers(currentRequestPage, getTotalRequestPages(), maxPaginationPages);
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
    return getPaginationPageNumbers(currentKeywordPage, getTotalKeywordPages(), maxPaginationPages);
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

  const openEventModal = () => {
    setEventTitle('');
    setEventBody('');
    setEventCoverFile(null);
    setEventCoverPreview('');
    setEventIsDrawEvent(false);
    setEventDeliveryScope(SITE_NOTIFICATION_DELIVERY_SCOPES.CURRENT_USERS);
    setEventError('');
    setShowEventModal(true);
  };

  const closeEventModal = ({ force = false } = {}) => {
    if (eventSending && !force) return;
    setShowEventModal(false);
    setEventTitle('');
    setEventBody('');
    setEventCoverFile(null);
    setEventCoverPreview('');
    setEventIsDrawEvent(false);
    setEventDeliveryScope(SITE_NOTIFICATION_DELIVERY_SCOPES.CURRENT_USERS);
    setEventError('');
  };

  const handleEventCoverChange = (e) => {
    const file = e.target.files?.[0] || null;
    setEventCoverFile(file);
    setEventError('');
    if (!file) {
      setEventCoverPreview('');
      return;
    }
    setEventCoverPreview(URL.createObjectURL(file));
  };

  const openEmailModal = () => {
    setEmailSubject('');
    setEmailPreview('');
    setEmailHeading('');
    setEmailBody('');
    setEmailCtaLabel('');
    setEmailCtaUrl('');
    setEmailError('');
    setShowEmailModal(true);
  };

  const closeEmailModal = ({ force = false } = {}) => {
    if (emailSending && !force) return;
    setShowEmailModal(false);
    setEmailSubject('');
    setEmailPreview('');
    setEmailHeading('');
    setEmailBody('');
    setEmailCtaLabel('');
    setEmailCtaUrl('');
    setEmailError('');
  };

  const handleSendEmail = async (e) => {
    e?.preventDefault();
    const trimmedSubject = emailSubject.trim();
    const trimmedPreview = emailPreview.trim();
    const trimmedHeading = emailHeading.trim();
    const trimmedBody = emailBody.trim();
    const trimmedCtaLabel = emailCtaLabel.trim();
    const trimmedCtaUrl = emailCtaUrl.trim();

    if (!trimmedSubject) { setEmailError('Subject is required.'); return; }
    if (!trimmedPreview) { setEmailError('Preview is required.'); return; }
    if (!trimmedHeading) { setEmailError('Heading is required.'); return; }
    if (!trimmedBody) { setEmailError('Message is required.'); return; }
    if ((trimmedCtaLabel && !trimmedCtaUrl) || (!trimmedCtaLabel && trimmedCtaUrl)) {
      setEmailError('Button label and URL must be filled together.');
      return;
    }
    if (!window.confirm('Send this email to all current active users?')) return;

    setEmailSending(true);
    setEmailError('');

    try {
      const result = await sendBulkUserEmail({
        subject: trimmedSubject,
        preview: trimmedPreview,
        heading: trimmedHeading,
        body: trimmedBody,
        ctaLabel: trimmedCtaLabel,
        ctaUrl: trimmedCtaUrl,
      });
      Promise.resolve(supabase.rpc('write_log', {
        p_action: 'ADMIN_SEND_EMAIL',
        p_status: 'Success',
        p_reason: trimmedSubject,
        p_metadata: {
          subject: trimmedSubject,
          preview: trimmedPreview,
          heading: trimmedHeading,
          recipientCount: result?.recipientCount ?? null,
          hasCta: !!trimmedCtaUrl,
        },
      })).catch(() => {});
      alert(`Email sent to ${result?.recipientCount ?? 0} current users.`);
      closeEmailModal({ force: true });
    } catch (err) {
      setEmailError(err.message || 'Failed to send email.');
    } finally {
      setEmailSending(false);
    }
  };

  const openEditDrawEventModal = (event) => {
    if (!event) return;
    setEditingDrawEvent(event);
    setEditDrawEventTitle(event.title || '');
    setEditDrawEventBody(event.body || '');
    setEditDrawEventCoverUrl(event.coverUrl || '');
    setEditDrawEventCoverFile(null);
    setEditDrawEventCoverPreview(event.coverUrl || '');
    setEditDrawEventDeliveryScope(event.deliveryScope || SITE_NOTIFICATION_DELIVERY_SCOPES.CURRENT_USERS);
    setEditDrawEventError('');
    setShowEditDrawEventModal(true);
  };

  const closeEditDrawEventModal = ({ force = false } = {}) => {
    if (editDrawEventSaving && !force) return;
    setShowEditDrawEventModal(false);
    setEditingDrawEvent(null);
    setEditDrawEventTitle('');
    setEditDrawEventBody('');
    setEditDrawEventCoverUrl('');
    setEditDrawEventCoverFile(null);
    setEditDrawEventCoverPreview('');
    setEditDrawEventDeliveryScope(SITE_NOTIFICATION_DELIVERY_SCOPES.CURRENT_USERS);
    setEditDrawEventError('');
  };

  const handleEditDrawEventCoverChange = (e) => {
    const file = e.target.files?.[0] || null;
    setEditDrawEventCoverFile(file);
    setEditDrawEventError('');
    if (!file) {
      setEditDrawEventCoverPreview(editDrawEventCoverUrl);
      return;
    }
    setEditDrawEventCoverPreview(URL.createObjectURL(file));
  };

  const handleRemoveEditDrawEventCover = () => {
    setEditDrawEventCoverUrl('');
    setEditDrawEventCoverFile(null);
    setEditDrawEventCoverPreview('');
    setEditDrawEventError('');
  };

  const handleSaveDrawEvent = async (e) => {
    e?.preventDefault();
    if (!editingDrawEvent) return;

    const trimmedTitle = editDrawEventTitle.trim();
    const trimmedBody = editDrawEventBody.trim();

    if (!trimmedTitle) { setEditDrawEventError('Title is required.'); return; }
    if (!trimmedBody) { setEditDrawEventError('Description is required.'); return; }

    setEditDrawEventSaving(true);
    setEditDrawEventError('');

    try {
      const coverUrl = editDrawEventCoverFile
        ? await uploadNotificationCover(editDrawEventCoverFile)
        : editDrawEventCoverUrl;
      const updatedEvent = await editDrawEvent({
        drawEventId: editingDrawEvent.id,
        title: trimmedTitle,
        body: trimmedBody,
        coverUrl,
        deliveryScope: editDrawEventDeliveryScope,
      });
      if (updatedEvent) {
        setDrawEvents((events) => events.map((event) => (
          event.id === updatedEvent.id ? { ...event, ...updatedEvent } : event
        )));
      }
      Promise.resolve(supabase.rpc('write_log', {
        p_action: 'ADMIN_EDIT_DRAW_EVENT',
        p_status: 'Success',
        p_reason: trimmedTitle,
        p_metadata: {
          drawEventId: editingDrawEvent.id,
          oldTitle: editingDrawEvent.title,
          newTitle: trimmedTitle,
          deliveryScope: editDrawEventDeliveryScope,
        },
      })).catch(() => {});
      closeEditDrawEventModal({ force: true });
      fetchDrawEvents();
    } catch (err) {
      setEditDrawEventError(err.message || 'Failed to save draw event.');
    } finally {
      setEditDrawEventSaving(false);
    }
  };

  const handleSendEvent = async (e) => {
    e?.preventDefault();
    const trimmedTitle = eventTitle.trim();
    const trimmedBody = eventBody.trim();

    if (!trimmedTitle) { setEventError('Title is required.'); return; }
    if (!trimmedBody) { setEventError('Description is required.'); return; }

    setEventSending(true);
    setEventError('');

    try {
      const coverUrl = eventCoverFile ? await uploadNotificationCover(eventCoverFile) : '';
      const notification = await createSiteNotification({
        title: trimmedTitle,
        body: trimmedBody,
        coverUrl,
        isDrawEvent: eventIsDrawEvent,
        deliveryScope: eventDeliveryScope,
      });
      if (eventIsDrawEvent && notification?.drawEventId) {
        try {
          await sendDrawEventEmail(notification.drawEventId);
        } catch (emailErr) {
          console.error('Failed to send draw event emails:', emailErr.message);
          alert(`Draw event created, but email delivery failed: ${emailErr.message}`);
        }
      }
      const action = eventIsDrawEvent ? 'ADMIN_CREATE_DRAW_EVENT' : 'ADMIN_SEND_NOTIFICATION';
      Promise.resolve(supabase.rpc('write_log', {
        p_action: action,
        p_status: 'Success',
        p_reason: eventIsDrawEvent ? `${trimmedTitle}` : `${trimmedTitle}`,
        p_metadata: {
          notificationId: notification?.id ?? null,
          drawEventId: notification?.drawEventId ?? null,
          title: trimmedTitle,
          isDrawEvent: eventIsDrawEvent,
          deliveryScope: eventDeliveryScope,
        },
      })).catch(() => {});
      if (eventIsDrawEvent) fetchDrawEvents();
      closeEventModal({ force: true });
    } catch (err) {
      setEventError(err.message || 'Failed to send notification.');
    } finally {
      setEventSending(false);
    }
  };

  const handleDisableDrawEvent = async (event) => {
    if (!event || event.isDisabled) return;
    if (!window.confirm('Disable this draw event? Existing users will see that the event ended.')) return;

    try {
      const { error } = await supabase.rpc('disable_draw_event', {
        p_draw_event_id: event.id,
      });
      if (error) throw new Error(error.message);
      Promise.resolve(supabase.rpc('write_log', {
        p_action: 'ADMIN_DISABLE_DRAW_EVENT',
        p_status: 'Success',
        p_reason: `${event.title}`,
        p_metadata: { drawEventId: event.id, title: event.title },
      })).catch(() => {});
      fetchDrawEvents();
    } catch (err) {
      alert('Failed to disable draw event: ' + err.message);
    }
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
      Promise.resolve(supabase.rpc('write_log', {
        p_action: 'ADMIN_ADD_KEYWORD',
        p_status: 'Success',
        p_reason: `${trimmedName}`,
        p_metadata: {
          keywordName: trimmedName,
          subcategoryId: parseInt(newKeywordSubcategoryId, 10),
        },
      })).catch(() => {});
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

  const adminNavItems = [
    { id: 0, label: 'Dashboard' },
    { id: 1, label: 'Users' },
    { id: 2, label: 'Keywords' },
    { id: 5, label: 'Notifications' },
    { id: 4, label: 'Requests' },
    { id: 3, label: 'Logs' },
  ];
  const currentPageTitle = adminNavItems.find((item) => item.id === page)?.label || 'Dashboard';

  return (
    <div className="container-fluid admin-shell px-0">
      <div className="row g-0 admin-layout">
        <aside className="admin-sidebar-column col-12 col-lg-auto">
          <div className="admin-sidebar d-flex flex-column text-white">
            <div className="admin-sidebar-menu flex-grow-1 py-4">
              <p className="admin-sidebar-section text-uppercase small mb-2 px-3">
                Menus
              </p>
              <nav className="nav flex-column gap-1 px-2" aria-label="Admin sections">
                {adminNavItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`admin-sidebar-link nav-link text-start w-100 ${page === item.id ? 'active' : ''}`}
                    aria-current={page === item.id ? 'page' : undefined}
                    onClick={() => setPage(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
            </div>
          </div>
        </aside>

        <main className="col admin-content px-3 px-md-4 py-4">
          <div className="admin-page-header d-flex flex-wrap align-items-center justify-content-between gap-3">
            <div>
              <h2 className="mb-0 text-start">{currentPageTitle}</h2>
            </div>
          </div>

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
                  {getDashboardYearOptions().map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
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
                  <div style={{ height: '250px' }}>
                    <canvas ref={pagamentosChartRef}></canvas>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="row mb-5">
            <div className="col-md-6 mb-4 mb-md-0">
              <div className="card h-100">
                <div className="card-body">
                  <h2 className="card-title">Users</h2>
                  <div style={{ height: '250px' }}>
                    <canvas ref={utilizadoresChartRef}></canvas>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-md-6">
              <div className="card h-100">
                <div className="card-body">
                  <h2 className="card-title">Views</h2>
                  <div style={{ height: '250px' }}>
                    <canvas ref={visitsChartRef}></canvas>
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
          <div className="admin-toolbar d-flex justify-content-end">
            <div className="input-group admin-search-group">
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
          <div className="table-responsive">
            <table className="table table-striped align-middle text-center">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Status</th>
                  <th scope="col" colSpan={3}>Actions</th>
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
          </div>

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
          <div className="admin-toolbar d-flex justify-content-end">
            <div className="input-group admin-search-group admin-search-group--wide">
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
          <div className="table-responsive">
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
                      <td>{log.details || '-'}</td>
                      <td>{log.date}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

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

      {/* Notifications Tab */}
      {page === 5 && (
        <>
          <div className="admin-toolbar d-flex flex-wrap justify-content-between align-items-center gap-3">
            <div className="d-flex flex-wrap gap-2">
              <button
                type="button"
                className="btn text-white admin-add-keyword-btn"
                onClick={openEventModal}
              >
                Send Notification
              </button>
              <button
                type="button"
                className="btn btn-outline-primary"
                onClick={openEmailModal}
              >
                Send Email
              </button>
            </div>
          </div>

          {drawEventsLoading ? (
            <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '200px' }}>
              <div className="spinner-border spinner-primary" role="status">
                <span className="visually-hidden">Loading draw events...</span>
              </div>
            </div>
          ) : drawEventsError ? (
            <div className="alert alert-danger">Failed to load draw events: {drawEventsError}</div>
          ) : (
          <div className="table-responsive">
            <table className="table table-striped align-middle text-center admin-notifications-table">
              <thead>
                <tr>
                  <th scope="col">Draw Events</th>
                  <th scope="col" colSpan={2}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {drawEvents.length === 0 ? (
                  <tr><td colSpan={3} className="text-muted">No draw events found.</td></tr>
                ) : (
                  drawEvents.map((event) => (
                    <tr key={event.id}>
                      <td>
                        {event.title}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => openEditDrawEventModal(event)}
                        >
                          Edit
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDisableDrawEvent(event)}
                          disabled={event.isDisabled}
                        >
                          {event.isDisabled ? 'Disabled' : 'Disable'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          )}
        </>
      )}

      {/* Requests Tab */}
      {page === 4 && (
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
          <div className="table-responsive">
            <table className="table table-striped align-middle text-center">
              <thead>
                <tr>
                  <th scope="col">Keyword</th>
                  <th scope="col">Subcategory</th>
                  <th scope="col">Request Amounts</th>
                  <th scope="col" colSpan={3}>Actions</th>
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
          </div>

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
        </>
      )}

      {/* Keywords Tab */}
      {page === 2 && (
        <>
          {/* Keywords Table */}
          <div className="admin-toolbar d-flex flex-wrap justify-content-between align-items-center gap-3">
            <button
              type="button"
              className="btn text-white admin-add-keyword-btn"
              onClick={handleAddKwOpen}
            >
              Add Keyword
            </button>
            <div className="input-group admin-search-group">
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
          <div className="table-responsive">
            <table className="table table-striped align-middle text-center">
              <thead>
                <tr>
                  <th scope="col">Keyword</th>
                  <th scope="col">Subcategory</th>
                  <th scope="col" colSpan={2}>Actions</th>
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
          </div>

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

      {/* Send Notification Modal */}
      {showEventModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <form onSubmit={handleSendEvent}>
                <div className="modal-header">
                  <h5 className="modal-title">Send Notification</h5>
                  <button type="button" className="btn-close" onClick={() => closeEventModal()} disabled={eventSending}></button>
                </div>
                <div className="modal-body">
                  {eventError && (
                    <div className="alert alert-danger py-2" role="alert">
                      {eventError}
                    </div>
                  )}

                  <div className="mb-3">
                    <label htmlFor="eventTitle" className="form-label">Title</label>
                    <input
                      id="eventTitle"
                      type="text"
                      className="form-control"
                      placeholder="Enter notification title"
                      value={eventTitle}
                      maxLength={NOTIFICATION_TITLE_MAX_LENGTH}
                      onChange={(e) => setEventTitle(e.target.value)}
                      required
                    />
                  </div>

                  <div className="mb-3">
                    <label htmlFor="eventBody" className="form-label">Description</label>
                    <textarea
                      id="eventBody"
                      className="form-control"
                      rows="3"
                      placeholder="Enter notification description"
                      value={eventBody}
                      maxLength={NOTIFICATION_BODY_MAX_LENGTH}
                      onChange={(e) => setEventBody(e.target.value)}
                      style={{ height: '96px', resize: 'none' }}
                      required
                    ></textarea>
                  </div>

                  <div className="mb-3">
                    <label htmlFor="eventDeliveryScope" className="form-label">Delivery</label>
                    <select
                      id="eventDeliveryScope"
                      className="form-select"
                      value={eventDeliveryScope}
                      onChange={(e) => setEventDeliveryScope(e.target.value)}
                      disabled={eventSending}
                    >
                      <option value={SITE_NOTIFICATION_DELIVERY_SCOPES.CURRENT_USERS}>
                        Send just to current users
                      </option>
                      <option value={SITE_NOTIFICATION_DELIVERY_SCOPES.CURRENT_AND_FUTURE_USERS}>
                        Send to current and future users
                      </option>
                    </select>
                  </div>

                  <div className="mb-3">
                    <label htmlFor="eventCover" className="form-label">
                      Cover <span className="text-muted fw-normal">(Optional)</span>
                    </label>
                    <input
                      id="eventCover"
                      type="file"
                      className="form-control"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handleEventCoverChange}
                    />
                  </div>

                  {eventCoverPreview && (
                    <div className="ratio ratio-16x9 bg-light rounded overflow-hidden border">
                      <img
                        src={eventCoverPreview}
                        alt=""
                        className="w-100 h-100 object-fit-cover"
                      />
                    </div>
                  )}

                  <div className="form-check mt-3">
                    <input
                      id="eventIsDrawEvent"
                      type="checkbox"
                      className="form-check-input"
                      checked={eventIsDrawEvent}
                      onChange={(e) => setEventIsDrawEvent(e.target.checked)}
                      disabled={eventSending}
                    />
                    <label className="form-check-label" htmlFor="eventIsDrawEvent">
                      Draw Event
                    </label>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => closeEventModal()} disabled={eventSending}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={eventSending || !eventTitle.trim() || !eventBody.trim()}
                  >
                    {eventSending ? (
                      <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                    ) : (
                      'Send'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Send Email Modal */}
      {showEmailModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <form onSubmit={handleSendEmail}>
                <div className="modal-header">
                  <h5 className="modal-title">Send Email</h5>
                  <button type="button" className="btn-close" onClick={() => closeEmailModal()} disabled={emailSending}></button>
                </div>
                <div className="modal-body">
                  {emailError && (
                    <div className="alert alert-danger py-2" role="alert">
                      {emailError}
                    </div>
                  )}

                  <div className="mb-3">
                    <label htmlFor="emailSubject" className="form-label">Subject</label>
                    <input
                      id="emailSubject"
                      type="text"
                      className="form-control"
                      placeholder="Enter email subject"
                      value={emailSubject}
                      maxLength={BULK_EMAIL_SUBJECT_MAX_LENGTH}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      disabled={emailSending}
                      required
                    />
                  </div>

                  <div className="mb-3">
                    <label htmlFor="emailPreview" className="form-label">Preview</label>
                    <input
                      id="emailPreview"
                      type="text"
                      className="form-control"
                      placeholder="Enter email preview"
                      value={emailPreview}
                      maxLength={BULK_EMAIL_PREVIEW_MAX_LENGTH}
                      onChange={(e) => setEmailPreview(e.target.value)}
                      disabled={emailSending}
                      required
                    />
                  </div>

                  <div className="mb-3">
                    <label htmlFor="emailHeading" className="form-label">Heading</label>
                    <input
                      id="emailHeading"
                      type="text"
                      className="form-control"
                      placeholder="Enter email heading"
                      value={emailHeading}
                      maxLength={BULK_EMAIL_HEADING_MAX_LENGTH}
                      onChange={(e) => setEmailHeading(e.target.value)}
                      disabled={emailSending}
                      required
                    />
                  </div>

                  <div className="mb-3">
                    <label htmlFor="emailBody" className="form-label">Message</label>
                    <textarea
                      id="emailBody"
                      className="form-control"
                      rows="7"
                      placeholder="Enter email message"
                      value={emailBody}
                      maxLength={BULK_EMAIL_BODY_MAX_LENGTH}
                      onChange={(e) => setEmailBody(e.target.value)}
                      disabled={emailSending}
                      style={{ height: '180px', resize: 'none' }}
                      required
                    ></textarea>
                  </div>

                  <div className="row g-3">
                    <div className="col-md-5">
                      <label htmlFor="emailCtaLabel" className="form-label">
                        Button Label <span className="text-muted fw-normal">(Optional)</span>
                      </label>
                      <input
                        id="emailCtaLabel"
                        type="text"
                        className="form-control"
                        placeholder="Open LetsFindPeople"
                        value={emailCtaLabel}
                        maxLength={BULK_EMAIL_CTA_LABEL_MAX_LENGTH}
                        onChange={(e) => setEmailCtaLabel(e.target.value)}
                        disabled={emailSending}
                      />
                    </div>
                    <div className="col-md-7">
                      <label htmlFor="emailCtaUrl" className="form-label">
                        Button URL <span className="text-muted fw-normal">(Optional)</span>
                      </label>
                      <input
                        id="emailCtaUrl"
                        type="url"
                        className="form-control"
                        placeholder="https://letsfindpeople.com"
                        value={emailCtaUrl}
                        maxLength={BULK_EMAIL_CTA_URL_MAX_LENGTH}
                        onChange={(e) => setEmailCtaUrl(e.target.value)}
                        disabled={emailSending}
                      />
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => closeEmailModal()} disabled={emailSending}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={emailSending || !emailSubject.trim() || !emailPreview.trim() || !emailHeading.trim() || !emailBody.trim()}
                  >
                    {emailSending ? (
                      <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                    ) : (
                      'Send'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Draw Event Modal */}
      {showEditDrawEventModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <form onSubmit={handleSaveDrawEvent}>
                <div className="modal-header">
                  <h5 className="modal-title">Edit Draw Event</h5>
                  <button type="button" className="btn-close" onClick={() => closeEditDrawEventModal()} disabled={editDrawEventSaving}></button>
                </div>
                <div className="modal-body">
                  {editDrawEventError && (
                    <div className="alert alert-danger py-2" role="alert">
                      {editDrawEventError}
                    </div>
                  )}

                  <div className="mb-3">
                    <label htmlFor="editDrawEventTitle" className="form-label">Title</label>
                    <input
                      id="editDrawEventTitle"
                      type="text"
                      className="form-control"
                      value={editDrawEventTitle}
                      maxLength={NOTIFICATION_TITLE_MAX_LENGTH}
                      onChange={(e) => setEditDrawEventTitle(e.target.value)}
                      disabled={editDrawEventSaving}
                      required
                    />
                  </div>

                  <div className="mb-3">
                    <label htmlFor="editDrawEventBody" className="form-label">Description</label>
                    <textarea
                      id="editDrawEventBody"
                      className="form-control"
                      rows="5"
                      value={editDrawEventBody}
                      maxLength={NOTIFICATION_BODY_MAX_LENGTH}
                      onChange={(e) => setEditDrawEventBody(e.target.value)}
                      disabled={editDrawEventSaving}
                      style={{ height: '140px', resize: 'none' }}
                      required
                    ></textarea>
                  </div>

                  <div className="mb-3">
                    <label htmlFor="editDrawEventDeliveryScope" className="form-label">Delivery</label>
                    <select
                      id="editDrawEventDeliveryScope"
                      className="form-select"
                      value={editDrawEventDeliveryScope}
                      onChange={(e) => setEditDrawEventDeliveryScope(e.target.value)}
                      disabled={editDrawEventSaving}
                    >
                      <option value={SITE_NOTIFICATION_DELIVERY_SCOPES.CURRENT_USERS}>
                        Current users only
                      </option>
                      <option value={SITE_NOTIFICATION_DELIVERY_SCOPES.CURRENT_AND_FUTURE_USERS}>
                        Current and future users
                      </option>
                    </select>
                  </div>

                  <div className="mb-3">
                    <label htmlFor="editDrawEventCover" className="form-label">
                      Cover <span className="text-muted fw-normal">(Optional)</span>
                    </label>
                    <input
                      id="editDrawEventCover"
                      type="file"
                      className="form-control"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handleEditDrawEventCoverChange}
                      disabled={editDrawEventSaving}
                    />
                  </div>

                  {editDrawEventCoverPreview && (
                    <div className="mb-3">
                      <div className="ratio ratio-16x9 bg-light rounded overflow-hidden border">
                        <img
                          src={editDrawEventCoverPreview}
                          alt=""
                          className="w-100 h-100 object-fit-cover"
                        />
                      </div>
                      <button
                        type="button"
                        className="btn btn-outline-danger btn-sm mt-2"
                        onClick={handleRemoveEditDrawEventCover}
                        disabled={editDrawEventSaving}
                      >
                        Remove Cover
                      </button>
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => closeEditDrawEventModal()} disabled={editDrawEventSaving}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={editDrawEventSaving || !editDrawEventTitle.trim() || !editDrawEventBody.trim()}
                  >
                    {editDrawEventSaving ? (
                      <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                    ) : (
                      'Save'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
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
        </main>
      </div>
    </div>
  );
}

export default Admin;
