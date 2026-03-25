chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    last_check: null,
    ipinfo_key: '',
    ipqs_key: ''
  });
});

chrome.runtime.onStartup.addListener(() => {
  console.log('Claude IP Risk Detector extension started');
});