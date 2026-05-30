const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getEntries: (args) => ipcRenderer.invoke('get-entries', args),
  getEntry: (entryId) => ipcRenderer.invoke('get-entry', entryId),
  saveRawHtml: (payload) => ipcRenderer.invoke('save-raw-html', payload),
  setLikeStatus: (payload) => ipcRenderer.invoke('set-like-status', payload),
  toggleFavorite: (entryId) => ipcRenderer.invoke('toggle-favorite', entryId),
  saveComment: (payload) => ipcRenderer.invoke('save-comment', payload),
  trackClick: (entryId) => ipcRenderer.invoke('track-click', entryId),
  trackShare: (entryId) => ipcRenderer.invoke('track-share', entryId),
  
  getFeeds: () => ipcRenderer.invoke('get-feeds'),
  getCategories: () => ipcRenderer.invoke('get-categories'),
  
  getInterestsProfile: () => ipcRenderer.invoke('get-interests-profile'),
  saveInterestsProfile: (content) => ipcRenderer.invoke('save-interests-profile', content),
  
  getDailyReports: () => ipcRenderer.invoke('get-daily-reports'),
  getDailyReportDetails: (date) => ipcRenderer.invoke('get-daily-report-details', date),
  
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  
  runPythonCli: (args) => ipcRenderer.invoke('run-python-cli', args),
  openUrl: (url) => ipcRenderer.invoke('open-url', url)
});
