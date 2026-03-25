const STORAGE_KEYS = {
  IPINFO_KEY: 'ipinfo_key',
  IPQS_KEY: 'ipqs_key',
  SCAMALYTICS_KEY: 'scamalytics_key',
  LAST_CHECK: 'last_check'
};

const DATACENTER_KEYWORDS = [
  'aws', 'amazon', 'google cloud', 'azure', 'microsoft', 'alibaba', 'aliyun',
  'ovh', 'linode', 'digitalocean', 'vultr', 'rackspace', 'hostinger',
  'cloudflare', 'leaseweb', 'choopa', 'psychz', 'hosteons', 'contabo',
  'amazon web services', 'google llc', 'microsoft corporation', 'hetzner',
  'cogent', 'twelve99', 'akamai', 'dosarrest', 'psychz networks'
];

const VPN_PROVIDER_KEYWORDS = [
  'nordvpn', 'expressvpn', 'surfshark', 'cyberghost', 'private internet access',
  'ipvanish', 'hotspot shield', 'protonvpn', 'mullvad', 'windscribe',
  'tunnelbear', 'bitdefender', 'kaspersky', 'avg', 'avast', 'nord',
  'purevpn', 'vyprvpn', 'strongvpn', 'ghost', 'vpn', 'proxy'
];

let apiKeys = {
  ipinfo: '',
  ipqs: '',
  scamalytics: ''
};

document.addEventListener('DOMContentLoaded', async () => {
  loadAPIKeys();
  setupEventListeners();
  await loadLastCheck();
});

function loadAPIKeys() {
  chrome.storage.local.get([STORAGE_KEYS.IPINFO_KEY, STORAGE_KEYS.IPQS_KEY, STORAGE_KEYS.SCAMALYTICS_KEY], (result) => {
    apiKeys.ipinfo = result[STORAGE_KEYS.IPINFO_KEY] || '';
    apiKeys.ipqs = result[STORAGE_KEYS.IPQS_KEY] || '';
    apiKeys.scamalytics = result[STORAGE_KEYS.SCAMALYTICS_KEY] || '';
    document.getElementById('ipinfo-key').value = apiKeys.ipinfo;
    document.getElementById('ipqs-key').value = apiKeys.ipqs;
  });
}

function setupEventListeners() {
  document.getElementById('save-keys').addEventListener('click', saveAPIKeys);
  document.getElementById('check-btn').addEventListener('click', runDetection);
}

function saveAPIKeys() {
  const ipinfoKey = document.getElementById('ipinfo-key').value.trim();
  const ipqsKey = document.getElementById('ipqs-key').value.trim();
  const scamalyticsKey = document.getElementById('scamalytics-key').value.trim();

  chrome.storage.local.set({
    [STORAGE_KEYS.IPINFO_KEY]: ipinfoKey,
    [STORAGE_KEYS.IPQS_KEY]: ipqsKey,
    [STORAGE_KEYS.SCAMALYTICS_KEY]: scamalyticsKey
  }, () => {
    apiKeys.ipinfo = ipinfoKey;
    apiKeys.ipqs = ipqsKey;
    apiKeys.scamalytics = scamalyticsKey;
    showStatus('Keys 已保存', 'success');
  });
}

function showStatus(message, type) {
  const statusEl = document.getElementById('save-status');
  statusEl.textContent = message;
  statusEl.className = 'status ' + type;
  setTimeout(() => { statusEl.textContent = ''; }, 2000);
}

async function loadLastCheck() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.LAST_CHECK, (result) => {
      resolve(result[STORAGE_KEYS.LAST_CHECK] || null);
    });
  });
}

async function saveLastCheck(data) {
  chrome.storage.local.set({
    [STORAGE_KEYS.LAST_CHECK]: {
      ...data,
      timestamp: Date.now()
    }
  });
}

async function runDetection() {
  showLoading(true);
  hideError();

  const detectionResult = {
    ipData: null,
    ping0Data: null,
    ipqsData: null,
    scamalyticsData: null,
    dnsLeakData: null,
    environmentData: null,
    lastCheck: null,
    riskScore: 0,
    reasons: []
  };

  try {
    detectionResult.lastCheck = await loadLastCheck();

    detectionResult.ping0Data = await checkPing0();
    detectionResult.ipData = await checkIPInfo();
    detectionResult.ipqsData = await checkIPQS();

    const currentIP = detectionResult.ipData?.ip || detectionResult.ping0Data?.ip;
    if (currentIP) {
      detectionResult.scamalyticsData = await checkScamalytics(currentIP);
    }

    detectionResult.dnsLeakData = await checkDNSLeak();
    detectionResult.environmentData = checkEnvironment();

    calculateRiskScore(detectionResult);
    displayResults(detectionResult);
    await saveLastCheck({
      ip: detectionResult.ipData?.ip || detectionResult.ping0Data?.ip,
      country: detectionResult.ipData?.country || 'N/A',
      location: detectionResult.ping0Data?.location || detectionResult.ipData?.city || 'N/A'
    });

  } catch (error) {
    showError('检测失败: ' + error.message);
  } finally {
    showLoading(false);
  }
}

async function checkPing0() {
  try {
    const response = await fetch('https://ping0.cc/geo');
    const text = await response.text();
    const lines = text.trim().split('\n');

    if (lines.length >= 4) {
      const orgLower = lines[3].trim().toLowerCase();
      const asnLower = lines[2].trim().toLowerCase();

      const isDatacenter = DATACENTER_KEYWORDS.some(kw => orgLower.includes(kw) || asnLower.includes(kw));
      const isVPN = VPN_PROVIDER_KEYWORDS.some(kw => orgLower.includes(kw) || asnLower.includes(kw));

      return {
        ip: lines[0].trim(),
        location: lines[1].trim(),
        asn: lines[2].trim(),
        org: lines[3].trim(),
        isidc: isDatacenter,
        isvpn: isVPN,
        country: extractCountry(lines[1].trim())
      };
    }
    return null;
  } catch (error) {
    console.warn('ping0.cc fetch failed:', error);
    return null;
  }
}

function extractCountry(location) {
  if (!location) return 'N/A';
  const parts = location.split(' ');
  return parts[0] || 'N/A';
}

async function checkIPInfo() {
  if (!apiKeys.ipinfo) {
    return await checkIPInfoFree();
  }

  try {
    const response = await fetch(`https://ipinfo.io/json?token=${apiKeys.ipinfo}`);
    if (!response.ok) return await checkIPInfoFree();
    const data = await response.json();

    const orgLower = (data.org || '').toLowerCase();
    const isDatacenter = DATACENTER_KEYWORDS.some(kw => orgLower.includes(kw));
    const isVPN = VPN_PROVIDER_KEYWORDS.some(kw => orgLower.includes(kw));

    return {
      ip: data.ip,
      city: data.city,
      country: data.country,
      org: data.org,
      hostname: data.hostname,
      isidc: isDatacenter,
      isvpn: isVPN
    };
  } catch (error) {
    console.warn('ipinfo.io check failed:', error);
    return await checkIPInfoFree();
  }
}

async function checkIPInfoFree() {
  try {
    const response = await fetch('https://ip-api.com/json/');
    if (!response.ok) return null;
    const data = await response.json();
    if (data.status === 'fail') return null;

    const orgLower = (data.org || '').toLowerCase();
    const isDatacenter = DATACENTER_KEYWORDS.some(kw => orgLower.includes(kw));
    const isVPN = VPN_PROVIDER_KEYWORDS.some(kw => orgLower.includes(kw));

    return {
      ip: data.query,
      city: data.city,
      country: data.countryCode,
      countryName: data.country,
      org: data.org || 'N/A',
      isp: data.isp,
      isidc: isDatacenter,
      isvpn: isVPN
    };
  } catch (error) {
    console.warn('ip-api.com check failed:', error);
    return null;
  }
}

async function checkIPQS() {
  if (!apiKeys.ipqs) return null;

  try {
    const ip = await getCurrentIP();
    const response = await fetch(`https://ipqualityscore.com/api/json/ip/${apiKeys.ipqs}/${ip}`);
    if (!response.ok) return null;
    const data = await response.json();
    if (data.success === false) return null;
    return {
      fraud_score: data.fraud_score,
      abuse_velocity: data.abuse_velocity,
      is_proxy: data.proxy,
      is_vpn: data.vpn,
      is_tor: data.tor,
      is_datacenter: data.tor || data.proxy,
      country: data.country_code
    };
  } catch (error) {
    console.warn('IPQS check failed:', error);
    return null;
  }
}

async function checkScamalytics(ip) {
  if (!apiKeys.scamalytics) return null;

  try {
    const response = await fetch(`https://scamalytics.com/api/lookup?key=${apiKeys.scamalytics}&ip=${ip}`);
    if (!response.ok) return null;
    const data = await response.json();
    return {
      ip: data.ip,
      score: parseInt(data.score) || 0,
      risk: data.risk
    };
  } catch (error) {
    console.warn('Scamalytics check failed:', error);
    return null;
  }
}

async function getCurrentIP() {
  try {
    const response = await fetch('https://ipinfo.io/ip');
    if (!response.ok) throw new Error('Failed to get IP');
    return await response.text();
  } catch (error) {
    try {
      const response = await fetch('https://ping0.cc');
      return await response.text();
    } catch {
      return '127.0.0.1';
    }
  }
}

async function checkDNSLeak() {
  const ipSources = [
    { name: 'ipify', url: 'https://api.ipify.org?format=json' },
    { name: 'ipinfo', url: 'https://ipinfo.io/json' }
  ];

  const results = [];

  for (const source of ipSources) {
    try {
      const response = await fetch(source.url);
      if (response.ok) {
        const data = await response.json();
        const ip = data.ip || data.query;
        if (ip) {
          results.push({ provider: source.name, ip: ip });
        }
      }
    } catch (error) {
      console.warn(`DNS leak check failed for ${source.name}:`, error);
    }
  }

  if (results.length >= 2) {
    const allSame = results.every(r => r.ip === results[0].ip);
    return {
      isConsistent: allSame,
      servers: results,
      ispIP: results[0].ip
    };
  }

  return results.length > 0 ? { isConsistent: true, servers: results, ispIP: results[0].ip } : null;
}

function checkEnvironment() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const language = navigator.language;
  const platform = navigator.platform;

  const offset = new Date().getTimezoneOffset();
  const timezoneOffsetHours = Math.abs(Math.floor(offset / 60));
  const timezoneOffsetMins = Math.abs(offset % 60);
  const tzSign = offset <= 0 ? '+' : '-';

  return {
    timezone,
    language,
    platform,
    timezoneOffset: `GMT${tzSign}${timezoneOffsetHours.toString().padStart(2, '0')}:${timezoneOffsetMins.toString().padStart(2, '0')}`
  };
}

function calculateRiskScore(result) {
  let score = 0;
  const reasons = [];

  const ping0 = result.ping0Data;
  const ipqs = result.ipqsData;
  const ipInfo = result.ipData;
  const env = result.environmentData;
  const lastCheck = result.lastCheck;

  const isDatacenter = (ping0?.isidc || ipInfo?.isidc || ipqs?.is_datacenter);
  const isVPN = (ping0?.isvpn || ipInfo?.isvpn || ipqs?.is_vpn);

  if (isDatacenter) {
    score += 40;
    reasons.push('当前 IP 属于数据中心/IDC段，高危');
  }

  if (isVPN && !isDatacenter) {
    score += 25;
    reasons.push('检测到 VPN 或代理');
  }

  if (ipqs) {
    if (ipqs.fraud_score > 70) {
      score += 30;
      reasons.push(`IPQS 欺诈评分过高: ${ipqs.fraud_score}`);
    } else if (ipqs.fraud_score > 40) {
      score += 15;
      reasons.push(`IPQS 欺诈评分中等: ${ipqs.fraud_score}`);
    }
  }

  const scamalytics = result.scamalyticsData;
  if (scamalytics) {
    if (scamalytics.score >= 75) {
      score += 35;
      reasons.push(`Scamalytics 风险评分过高: ${scamalytics.score} (${scamalytics.risk})`);
    } else if (scamalytics.score >= 50) {
      score += 20;
      reasons.push(`Scamalytics 风险评分中等: ${scamalytics.score} (${scamalytics.risk})`);
    } else if (scamalytics.score >= 25) {
      score += 10;
      reasons.push(`Scamalytics 风险评分偏低: ${scamalytics.score}`);
    }
  }

  if (lastCheck && (ping0 || ipInfo)) {
    const hoursSinceLastCheck = (Date.now() - lastCheck.timestamp) / (1000 * 60 * 60);
    const currentCountry = ping0?.country || ipInfo?.country || 'N/A';

    if (lastCheck.country && currentCountry && lastCheck.country !== currentCountry && lastCheck.country !== 'N/A' && currentCountry !== 'N/A') {
      if (hoursSinceLastCheck < 24) {
        score += 35;
        reasons.push(`地区切换频繁 (${lastCheck.country} → ${currentCountry})，24小时内`);
      } else if (hoursSinceLastCheck < 168) {
        score += 20;
        reasons.push(`检测到地区切换 (${lastCheck.country} → ${currentCountry})，7天内`);
      }
    }
  }

  if (env && (ping0 || ipInfo) && !isDatacenter) {
    const ipCountry = ping0?.country || ipInfo?.country || '';
    const tzWarning = checkTimezoneCountryMismatch(env.timezone, ipCountry);
    if (tzWarning) {
      score += 15;
      reasons.push(tzWarning);
    }
  }

  result.riskScore = Math.min(100, score);
  result.reasons = reasons;
}

function checkTimezoneCountryMismatch(timezone, ipCountry) {
  const cnTimezones = ['shanghai', 'beijing', 'hong_kong', 'taipei', 'singapore'];
  const jpTimezones = ['tokyo', 'osaka', 'sapporo'];
  const krTimezones = ['seoul', 'busan'];
  const usTimezones = ['new_york', 'los_angeles', 'chicago', 'denver', 'phoenix', 'anchorage', 'honolulu', 'pacific', 'eastern', 'central', 'mountain'];
  const euTimezones = ['london', 'paris', 'berlin', 'amsterdam', 'stockholm', 'madrid', 'rome', 'vienna'];

  const timezoneLower = timezone.toLowerCase();

  if (ipCountry === 'US' || ipCountry === '美国') {
    if (cnTimezones.some(tz => timezoneLower.includes(tz)) ||
        jpTimezones.some(tz => timezoneLower.includes(tz)) ||
        krTimezones.some(tz => timezoneLower.includes(tz))) {
      return `时区与 IP 地区不匹配 (时区: ${timezone}, IP: 美国)`;
    }
  }

  if (ipCountry === 'CN' || ipCountry === '中国') {
    if (usTimezones.some(tz => timezoneLower.includes(tz))) {
      return `时区与 IP 地区不匹配 (时区: ${timezone}, IP: 中国)`;
    }
  }

  return null;
}

function displayResults(result) {
  const { ping0Data, ipData, ipqsData, environmentData, riskScore, reasons } = result;

  document.getElementById('settings-section').style.display = 'none';
  document.getElementById('result-section').style.display = 'block';

  const ip = ping0Data?.ip || ipData?.ip || 'N/A';
  const location = ping0Data?.location || (ipData?.city && ipData?.country ? `${ipData.city}, ${ipData.country}` : 'N/A');

  let ipType = 'Residential';
  if (ipqsData?.is_datacenter || ping0Data?.isidc || ipData?.isidc) {
    ipType = 'Datacenter (IDC)';
  } else if (ipqsData?.is_vpn || ipqsData?.is_proxy || ping0Data?.isvpn || ipData?.isvpn) {
    ipType = 'VPN/Proxy';
  } else if (ipData?.org && ipData.org !== 'N/A') {
    ipType = 'Commercial';
  } else {
    ipType = 'Residential';
  }

  let riskLevel;
  if (riskScore <= 25) {
    riskLevel = 'safe';
  } else if (riskScore <= 50) {
    riskLevel = 'caution';
  } else if (riskScore <= 75) {
    riskLevel = 'risky';
  } else {
    riskLevel = 'high';
  }

  const riskIcon = riskLevel === 'safe' ? '✅' : (riskLevel === 'caution' ? '⚠️' : (riskLevel === 'risky' ? '⚠️' : '❌'));

  document.getElementById('risk-icon').textContent = riskIcon;
  document.getElementById('risk-label').textContent = getRiskLabel(riskScore);
  document.getElementById('risk-level').className = `risk-level ${riskLevel}`;

  const reasonText = reasons.length > 0 ? reasons.join('；') : '未检测到明显风险';
  document.getElementById('risk-reason').textContent = reasonText;

  document.getElementById('ip-address').textContent = ip;
  document.getElementById('ip-type').textContent = ipType;
  document.getElementById('risk-score').textContent = riskScore;
  document.getElementById('ip-location').textContent = location;
  document.getElementById('is-idc').textContent = (ipqsData?.is_datacenter || ping0Data?.isidc || ipData?.isidc) ? '是 ⚠️' : '否 ✓';

  const dnsLeakData = result.dnsLeakData;
  if (dnsLeakData) {
    const dnsStatus = dnsLeakData.isConsistent
      ? 'IP 一致 ✓ 无泄露'
      : 'IP 不一致 ⚠️ 疑似泄露';
    document.getElementById('dns-leak').textContent = dnsStatus;
    const dnsServersEl = document.getElementById('dns-servers');
    dnsServersEl.innerHTML = `<div class="dns-info">来源: ${dnsLeakData.servers.map(d => `${d.provider}: ${d.ip}`).join('<br>来源: ')}</div>`;
    dnsServersEl.style.display = 'block';
  } else {
    document.getElementById('dns-leak').textContent = '未检测';
  }

  const lastCheck = result.lastCheck;
  const currentCountry = ping0Data?.country || ipData?.country || 'N/A';
  if (lastCheck && lastCheck.country && lastCheck.country !== 'N/A' && currentCountry !== 'N/A') {
    if (lastCheck.country !== currentCountry) {
      const hoursSince = (Date.now() - lastCheck.timestamp) / (1000 * 60 * 60);
      const daysSince = Math.floor(hoursSince / 24);
      const timeAgo = daysSince > 0 ? `${daysSince}天前` : `${Math.floor(hoursSince)}小时前`;
      document.getElementById('geo-jump').textContent = `${lastCheck.country} → ${currentCountry}`;
      const geoHistoryEl = document.getElementById('geo-history');
      geoHistoryEl.innerHTML = `<div class="geo-history">上次检测: ${lastCheck.country} (${timeAgo})<br>本次检测: ${currentCountry}<br>检测到地区切换，请注意账号风险</div>`;
      geoHistoryEl.style.display = 'block';
    } else {
      document.getElementById('geo-jump').textContent = '未切换 ✓';
    }
  } else {
    document.getElementById('geo-jump').textContent = '首次检测';
  }

  const warningsEl = document.getElementById('warnings');
  if (reasons.length > 0) {
    warningsEl.innerHTML = reasons.map(r => `<div class="warning-item">${r}</div>`).join('');
    warningsEl.style.display = 'block';
  } else {
    warningsEl.style.display = 'none';
  }

  document.getElementById('check-btn').textContent = '重新检测';
}

function getRiskLabel(score) {
  if (score <= 25) return '当前 IP 适合使用 Claude';
  if (score <= 50) return '存在轻度风险，建议注意';
  if (score <= 75) return '存在中度风险，建议切换节点';
  return '高危，极易触发封号';
}

function showLoading(show) {
  document.getElementById('loading').style.display = show ? 'flex' : 'none';
  document.getElementById('check-btn').disabled = show;
}

function hideError() {
  document.getElementById('error').style.display = 'none';
}

function showError(message) {
  const errorEl = document.getElementById('error');
  errorEl.textContent = message;
  errorEl.style.display = 'block';
}