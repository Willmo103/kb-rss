import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Rss, 
  Tag as TagIcon, 
  Plus, 
  X, 
  Info, 
  Calendar, 
  Sun, 
  Moon, 
  ChevronRight, 
  RefreshCw,
  Settings as SettingsIcon,
  ThumbsUp,
  ThumbsDown,
  Star,
  Share2,
  ExternalLink,
  BookOpen,
  Check,
  Award,
  Sparkles,
  Edit2,
  Trash2,
  User,
  ListFilter
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('feed'); // 'feed' | 'suggestions' | 'feeds' | 'tastes' | 'settings'
  const [entries, setEntries] = useState([]);
  const [limit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  
  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedFeedId, setSelectedFeedId] = useState('');
  const [selectedStatus, setSelectedStatus] = useState(''); // '' | 'liked' | 'disliked' | 'favorite' | 'suggested'
  
  // Metadata states
  const [feeds, setFeeds] = useState([]);
  const [categories, setCategories] = useState([]);
  
  // UI states
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [showNotification, setShowNotification] = useState(null); // { type, message }
  
  // CLI action loading states
  const [pollingFeeds, setPollingFeeds] = useState(false);
  const [runningAgent, setRunningAgent] = useState(false);
  
  // Feed management forms
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [newFeedCategory, setNewFeedCategory] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isAddingFeed, setIsAddingFeed] = useState(false);
  const [isAddingCategory, setIsAddingCategory] = useState(false);

  // Suggestions state
  const [dailyReports, setDailyReports] = useState([]);
  const [selectedReportDate, setSelectedReportDate] = useState(null);
  const [selectedReportContent, setSelectedReportContent] = useState(null); // { report, entries }
  const [loadingReportDetails, setLoadingReportDetails] = useState(false);

  // Interests / Taste profile state
  const [userInterests, setUserInterests] = useState('');
  const [agentTastes, setAgentTastes] = useState('');
  const [isSavingInterests, setIsSavingInterests] = useState(false);

  // Settings state
  const [settingsHost, setSettingsHost] = useState('');
  const [settingsModel, setSettingsModel] = useState('');
  const [settingsGotifyUrl, setSettingsGotifyUrl] = useState('');
  const [settingsGotifyToken, setSettingsGotifyToken] = useState('');
  const [settingsKbWebUrl, setSettingsKbWebUrl] = useState('');
  const [settingsKbWebApiKey, setSettingsKbWebApiKey] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  // Drawer comment edit state
  const [drawerComment, setDrawerComment] = useState('');
  const [isSavingComment, setIsSavingComment] = useState(false);

  // Drawer UI state configurations
  const [drawerExpanded, setDrawerExpanded] = useState(false);
  const [drawerMode, setDrawerMode] = useState('summary'); // 'summary' | 'web'

  // RSS Sources View States
  const [selectedSource, setSelectedSource] = useState(null);
  const [isSourcesExpanded, setIsSourcesExpanded] = useState(false);
  const [sourceEntries, setSourceEntries] = useState([]);
  const [sourceOffset, setSourceOffset] = useState(0);
  const [sourceHasMore, setSourceHasMore] = useState(true);
  const [sourceLoading, setSourceLoading] = useState(false);

  const loaderRef = useRef(null);
  const webviewRef = useRef(null);

  // Notification helper
  const triggerNotification = (type, message) => {
    setShowNotification({ type, message });
    setTimeout(() => {
      setShowNotification(null);
    }, 4000);
  };

  // Toggle Dark Mode
  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark');
      document.body.style.backgroundColor = '#1C1917';
      document.body.style.color = '#E7E5E4';
    } else {
      document.body.classList.remove('dark');
      document.body.style.backgroundColor = '#F4EFEA';
      document.body.style.color = '#3C2F2F';
    }
  }, [darkMode]);

  // Load Initial Metadata
  const loadMetadata = async () => {
    try {
      const allFeeds = await window.api.getFeeds();
      const allCats = await window.api.getCategories();
      setFeeds(allFeeds);
      setCategories(allCats);
    } catch (err) {
      console.error('Failed to load feeds/categories metadata:', err);
    }
  };

  useEffect(() => {
    loadMetadata();
  }, []);

  // Fetch Settings on Tab Open
  useEffect(() => {
    if (activeTab === 'settings') {
      window.api.getSettings().then((s) => {
        setSettingsHost(s.ollama_host || '');
        setSettingsModel(s.ollama_model || '');
        setSettingsGotifyUrl(s.gotify_url || '');
        setSettingsGotifyToken(s.gotify_token || '');
        setSettingsKbWebUrl(s.kb_web_url || '');
        setSettingsKbWebApiKey(s.kb_web_api_key || '');
      });
    } else if (activeTab === 'tastes') {
      loadTasteProfile();
    } else if (activeTab === 'suggestions') {
      loadDailyReports();
    }
  }, [activeTab]);

  const fetchSourceEntries = async (currentOffset, reset = false) => {
    if (!selectedSource || sourceLoading) return;
    setSourceLoading(true);
    try {
      const data = await window.api.getEntries({
        limit: 20,
        offset: currentOffset,
        feedId: selectedSource.id
      });
      if (data.length < 20) {
        setSourceHasMore(false);
      }
      if (reset) {
        setSourceEntries(data);
      } else {
        setSourceEntries((prev) => [...prev, ...data]);
      }
    } catch (err) {
      console.error('Error fetching source entries:', err);
    } finally {
      setSourceLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSource) {
      setSourceEntries([]);
      setSourceOffset(0);
      setSourceHasMore(true);
      fetchSourceEntries(0, true);
    }
  }, [selectedSource]);

  const handleSourceScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight + 50 && sourceHasMore && !sourceLoading) {
      setSourceOffset((prev) => {
        const next = prev + 20;
        fetchSourceEntries(next, false);
        return next;
      });
    }
  };

  // Reset entries list when filters change
  useEffect(() => {
    setEntries([]);
    setOffset(0);
    setHasMore(true);
    fetchEntries(0, true);
  }, [searchTerm, selectedCategoryId, selectedFeedId, selectedStatus]);

  // Infinite Scroll Observer for Entries list
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const target = entries[0];
      if (target.isIntersecting && hasMore && !loading && activeTab === 'feed') {
        setOffset((prevOffset) => {
          const nextOffset = prevOffset + limit;
          fetchEntries(nextOffset, false);
          return nextOffset;
        });
      }
    }, { threshold: 0.1 });

    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }

    return () => {
      if (loaderRef.current) {
        observer.unobserve(loaderRef.current);
      }
    };
  }, [hasMore, loading, offset, activeTab]);

  // Fetch Entries from database
  const fetchEntries = async (currentOffset, reset = false) => {
    if (loading) return;
    setLoading(true);
    try {
      const data = await window.api.getEntries({
        limit,
        offset: currentOffset,
        categoryId: selectedCategoryId,
        feedId: selectedFeedId,
        search: searchTerm,
        status: selectedStatus
      });

      if (data.length < limit) {
        setHasMore(false);
      }
      if (reset) {
        setEntries(data);
      } else {
        setEntries((prev) => [...prev, ...data]);
      }
    } catch (err) {
      console.error('Error fetching RSS entries:', err);
    } finally {
      setLoading(false);
    }
  };

  // Interactions (Like, Dislike, Star, Comment)
  const handleLike = async (entryId, currentLiked, value) => {
    const newLiked = currentLiked === value ? 0 : value; // toggle
    try {
      await window.api.setLikeStatus({ entryId, liked: newLiked });
      
      // Update local state
      setEntries(entries.map(e => e.id === entryId ? { ...e, liked: newLiked } : e));
      if (selectedEntry && selectedEntry.id === entryId) {
        setSelectedEntry({ ...selectedEntry, liked: newLiked });
      }
      if (selectedReportContent) {
        setSelectedReportContent({
          ...selectedReportContent,
          entries: selectedReportContent.entries.map(e => e.id === entryId ? { ...e, liked: newLiked } : e)
        });
      }
    } catch (err) {
      console.error('Error updating like status:', err);
    }
  };

  const handleFavorite = async (entryId) => {
    try {
      await window.api.toggleFavorite(entryId);
      setEntries(entries.map(e => e.id === entryId ? { ...e, favorite: 1 - e.favorite } : e));
      if (selectedEntry && selectedEntry.id === entryId) {
        setSelectedEntry({ ...selectedEntry, favorite: 1 - selectedEntry.favorite });
      }
      if (selectedReportContent) {
        setSelectedReportContent({
          ...selectedReportContent,
          entries: selectedReportContent.entries.map(e => e.id === entryId ? { ...e, favorite: 1 - e.favorite } : e)
        });
      }
    } catch (err) {
      console.error('Error toggling favorite status:', err);
    }
  };

  const handleSaveComment = async () => {
    if (!selectedEntry) return;
    setIsSavingComment(true);
    try {
      await window.api.saveComment({ entryId: selectedEntry.id, comment: drawerComment });
      setEntries(entries.map(e => e.id === selectedEntry.id ? { ...e, comment: drawerComment } : e));
      setSelectedEntry({ ...selectedEntry, comment: drawerComment });
      triggerNotification('success', 'Comment saved successfully.');
    } catch (err) {
      console.error('Failed to save comment:', err);
      triggerNotification('error', 'Failed to save comment.');
    } finally {
      setIsSavingComment(false);
    }
  };

  const handleOpenSource = async (entry) => {
    try {
      await window.api.trackClick(entry.id);
      window.api.openUrl(entry.link);
      setEntries(entries.map(e => e.id === entry.id ? { ...e, clicked: (e.clicked || 0) + 1 } : e));
      if (selectedEntry && selectedEntry.id === entry.id) {
        setSelectedEntry({ ...selectedEntry, clicked: (selectedEntry.clicked || 0) + 1 });
      }
    } catch (err) {
      console.error('Error opening link:', err);
    }
  };

  const handleShareLink = async (entry) => {
    try {
      await window.api.trackShare(entry.id);
      navigator.clipboard.writeText(entry.link);
      setEntries(entries.map(e => e.id === entry.id ? { ...e, shared: (e.shared || 0) + 1 } : e));
      if (selectedEntry && selectedEntry.id === entry.id) {
        setSelectedEntry({ ...selectedEntry, shared: (selectedEntry.shared || 0) + 1 });
      }
      triggerNotification('success', 'Article URL copied to clipboard.');
    } catch (err) {
      console.error('Error sharing link:', err);
    }
  };

  // Add RSS Feed via Python CLI command Bridge
  const handleAddFeed = async (e) => {
    e.preventDefault();
    if (!newFeedUrl) return;
    setIsAddingFeed(true);
    try {
      const args = ['feed', 'add', newFeedUrl];
      if (newFeedCategory) {
        args.push('--category', newFeedCategory);
      }
      
      const res = await window.api.runPythonCli(args);
      if (res.status === 'success') {
        triggerNotification('success', 'RSS Feed registered successfully.');
        setNewFeedUrl('');
        setNewFeedCategory('');
        loadMetadata();
      } else {
        triggerNotification('error', `Failed to register feed: ${res.message}`);
      }
    } catch (err) {
      console.error('Error adding feed:', err);
      triggerNotification('error', 'Error adding feed.');
    } finally {
      setIsAddingFeed(false);
    }
  };

  // Delete RSS Feed
  const handleDeleteFeed = async (feedId) => {
    if (!confirm('Are you sure you want to remove this RSS feed and delete all related entries?')) return;
    try {
      const res = await window.api.runPythonCli(['feed', 'remove', feedId.toString()]);
      if (res.status === 'success') {
        triggerNotification('success', 'Feed deleted successfully.');
        loadMetadata();
      } else {
        triggerNotification('error', `Failed to delete feed: ${res.message}`);
      }
    } catch (err) {
      console.error('Failed to delete feed:', err);
    }
  };

  // Add Category
  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCategoryName) return;
    setIsAddingCategory(true);
    try {
      const res = await window.api.runPythonCli(['category', 'add', newCategoryName]);
      if (res.status === 'success') {
        triggerNotification('success', 'Category created successfully.');
        setNewCategoryName('');
        loadMetadata();
      } else {
        triggerNotification('error', `Failed to add category: ${res.message}`);
      }
    } catch (err) {
      console.error('Error adding category:', err);
    } finally {
      setIsAddingCategory(false);
    }
  };

  // Sync / Polling Command
  const handlePollFeeds = async () => {
    if (pollingFeeds) return;
    setPollingFeeds(true);
    try {
      const res = await window.api.runPythonCli(['poll-once']);
      if (res.status === 'success') {
        triggerNotification('success', 'RSS feeds updated successfully.');
        // Refresh grid
        setEntries([]);
        setOffset(0);
        setHasMore(true);
        fetchEntries(0, true);
      } else {
        triggerNotification('error', `Poll failed: ${res.message}`);
      }
    } catch (err) {
      console.error('Poll feeds error:', err);
    } finally {
      setPollingFeeds(false);
    }
  };

  // Suggestions & Taste updating
  const loadDailyReports = async () => {
    try {
      const reports = await window.api.getDailyReports();
      setDailyReports(reports);
      if (reports.length > 0 && !selectedReportDate) {
        handleSelectReport(reports[0].date);
      }
    } catch (err) {
      console.error('Failed to load daily suggested reports:', err);
    }
  };

  const handleSelectReport = async (date) => {
    setSelectedReportDate(date);
    setLoadingReportDetails(true);
    try {
      const details = await window.api.getDailyReportDetails(date);
      setSelectedReportContent(details);
    } catch (err) {
      console.error('Failed loading report details:', err);
    } finally {
      setLoadingReportDetails(false);
    }
  };

  const loadTasteProfile = async () => {
    try {
      const data = await window.api.getInterestsProfile();
      setUserInterests(data.userInterests);
      setAgentTastes(data.agentTastes);
    } catch (err) {
      console.error('Failed to load taste profiles:', err);
    }
  };

  const handleSaveInterests = async () => {
    setIsSavingInterests(true);
    try {
      await window.api.saveInterestsProfile(userInterests);
      triggerNotification('success', 'User Interests saved successfully.');
    } catch (err) {
      console.error('Failed to save interests:', err);
      triggerNotification('error', 'Failed to save interests.');
    } finally {
      setIsSavingInterests(false);
    }
  };

  const handleTriggerAgent = async () => {
    if (runningAgent) return;
    setRunningAgent(true);
    triggerNotification('info', 'AI Agent compiling tastes & curating daily digest...');
    try {
      const res = await window.api.runPythonCli(['agent-run']);
      if (res.status === 'success') {
        triggerNotification('success', 'Daily digest recommendations generated!');
        loadTasteProfile();
        loadDailyReports();
      } else {
        triggerNotification('error', `Agent failed: ${res.message}`);
      }
    } catch (err) {
      console.error('Failed to run Ollama agent curation:', err);
    } finally {
      setRunningAgent(false);
    }
  };

  // Save Settings
  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await window.api.saveSettings({
        ollama_host: settingsHost,
        ollama_model: settingsModel,
        gotify_url: settingsGotifyUrl,
        gotify_token: settingsGotifyToken,
        kb_web_url: settingsKbWebUrl,
        kb_web_api_key: settingsKbWebApiKey
      });
      triggerNotification('success', 'Settings saved successfully.');
    } catch (err) {
      console.error('Failed to save settings:', err);
      triggerNotification('error', 'Failed to save settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  // Article content scraping & importing state
  const [scrapingArticle, setScrapingArticle] = useState(false);
  const [importingToWeb, setImportingToWeb] = useState(false);

  const handleImportToWeb = async (entryId) => {
    setImportingToWeb(true);
    triggerNotification('info', 'Uploading article page to kb-web...');
    try {
      const res = await window.api.runPythonCli(['import-to-web', entryId.toString()]);
      if (res.status === 'success') {
        triggerNotification('success', 'Successfully imported to kb-web!');
      } else {
        triggerNotification('error', `Import failed: ${res.message}`);
      }
    } catch (err) {
      console.error('Import error:', err);
      triggerNotification('error', 'Error occurred during import.');
    } finally {
      setImportingToWeb(false);
    }
  };

  const handleScrapeArticle = async (entryId) => {
    setScrapingArticle(true);
    try {
      const res = await window.api.runPythonCli(['fetch-full', entryId.toString()]);
      if (res.status === 'success') {
        triggerNotification('success', 'Full article content retrieved successfully.');
        const updatedEntry = await window.api.getEntry(entryId);
        if (updatedEntry) {
          setSelectedEntry(updatedEntry);
          setEntries(entries.map(e => e.id === entryId ? { 
            ...e, 
            full_content: updatedEntry.full_content, 
            image_url: updatedEntry.image_url 
          } : e));
          if (selectedReportContent) {
            setSelectedReportContent({
              ...selectedReportContent,
              entries: selectedReportContent.entries.map(e => e.id === entryId ? { 
                ...e, 
                full_content: updatedEntry.full_content, 
                image_url: updatedEntry.image_url 
              } : e)
            });
          }
        }
      } else {
        triggerNotification('error', `Failed to scrape: ${res.message}`);
      }
    } catch (err) {
      console.error('Scrape article error:', err);
      triggerNotification('error', 'Error occurred while fetching article content.');
    } finally {
      setScrapingArticle(false);
    }
  };

  // Open Drawer handler
  const handleOpenDrawer = (entry) => {
    setSelectedEntry(entry);
    setDrawerComment(entry.comment || '');
    setDrawerMode('summary');
    setDrawerExpanded(false);
  };

  // Automatically scrape raw HTML from webview when dom-ready fires
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview || !selectedEntry || drawerMode !== 'web') return;

    const handleDomReady = async () => {
      try {
        console.log("Webview dom-ready, evaluating document.documentElement.outerHTML for entry ID:", selectedEntry.id);
        const html = await webview.executeJavaScript("document.documentElement.outerHTML");
        if (html) {
          const res = await window.api.saveRawHtml({ entryId: selectedEntry.id, html });
          if (res && res.status === 'success') {
            console.log("Successfully auto-saved raw HTML from webview.");
            // Update current list entries
            setEntries(prev => prev.map(e => e.id === selectedEntry.id ? { ...e, full_content: html } : e));
            // Update selected entry so Summary mode can toggle/display the cached HTML immediately
            setSelectedEntry(prev => prev && prev.id === selectedEntry.id ? { ...prev, full_content: html } : prev);
            if (selectedReportContent) {
              setSelectedReportContent(prev => {
                if (!prev) return prev;
                return {
                  ...prev,
                  entries: prev.entries.map(e => e.id === selectedEntry.id ? { ...e, full_content: html } : e)
                };
              });
            }
          }
        }
      } catch (err) {
        console.error("Failed to export HTML from webview:", err);
      }
    };

    webview.addEventListener('dom-ready', handleDomReady);
    return () => {
      webview.removeEventListener('dom-ready', handleDomReady);
    };
  }, [selectedEntry?.id, drawerMode]);

  return (
    <div className={`h-screen flex flex-col ${darkMode ? 'dark bg-retro-bg-dark text-retro-text-dark' : 'bg-retro-bg-light text-retro-text-light'} transition-colors duration-200 overflow-hidden`}>
      
      {/* Toast Notification */}
      {showNotification && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded shadow-lg z-50 text-white flex items-center space-x-2 transition-all duration-300 animate-fade-in ${
          showNotification.type === 'success' ? 'bg-retro-green' : 
          showNotification.type === 'error' ? 'bg-retro-red' : 'bg-retro-blue'
        }`}>
          <Sparkles size={16} />
          <span className="text-sm font-semibold">{showNotification.message}</span>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-retro-border-light dark:border-retro-border-dark py-4 px-6 flex items-center justify-between sticky top-0 bg-retro-bg-light/95 dark:bg-retro-bg-dark/95 backdrop-blur z-20">
        <div className="flex items-center space-x-3">
          <div className="bg-retro-orange p-2 rounded text-white shadow-sm">
            <Rss size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">kb-rss</h1>
            <p className="text-xs opacity-60">Personal AI-Curated Feeds Navigator</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* Quick sync feeds */}
          <button
            onClick={handlePollFeeds}
            disabled={pollingFeeds}
            className="bg-retro-panel-light dark:bg-retro-panel-dark border border-retro-border-light dark:border-retro-border-dark hover:border-retro-orange hover:text-retro-orange text-xs px-3 py-1.5 rounded transition-all flex items-center space-x-1 font-semibold disabled:opacity-50"
            title="Poll RSS feeds for new entries now"
          >
            <RefreshCw size={12} className={pollingFeeds ? 'animate-spin' : ''} />
            <span>{pollingFeeds ? 'Syncing...' : 'Sync Feeds'}</span>
          </button>

          {/* Trigger Daily AI suggestions curation */}
          <button
            onClick={handleTriggerAgent}
            disabled={runningAgent}
            className="bg-retro-orange hover:bg-retro-orange/90 text-white text-xs px-3 py-1.5 rounded transition-all flex items-center space-x-1 font-semibold disabled:opacity-50 shadow-sm"
            title="Run AI Taste profile and daily recommended report curation"
          >
            <Sparkles size={12} className={runningAgent ? 'animate-pulse' : ''} />
            <span>{runningAgent ? 'Curation Running...' : 'Generate AI Digest'}</span>
          </button>

          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 hover:bg-retro-panel-light dark:hover:bg-retro-panel-dark rounded-full transition-colors"
            title="Toggle theme"
          >
            {darkMode ? <Sun size={18} className="text-retro-yellow" /> : <Moon size={18} className="text-retro-blue" />}
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* Pinned Left Sidebar */}
        <aside className="w-full md:w-64 p-6 border-r border-retro-border-light dark:border-retro-border-dark flex flex-col space-y-6 md:overflow-y-auto">
          {/* Navigation Tabs */}
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider opacity-60 block mb-2">Navigation</label>
            <button
              onClick={() => setActiveTab('feed')}
              className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center space-x-2 ${activeTab === 'feed' ? 'bg-retro-panel-light dark:bg-retro-panel-dark font-medium text-retro-orange' : 'hover:bg-retro-panel-light/50 dark:hover:bg-retro-panel-dark/50'}`}
            >
              <BookOpen size={16} />
              <span>Curation Feed</span>
            </button>
            <button
              onClick={() => setActiveTab('suggestions')}
              className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center space-x-2 ${activeTab === 'suggestions' ? 'bg-retro-panel-light dark:bg-retro-panel-dark font-medium text-retro-orange' : 'hover:bg-retro-panel-light/50 dark:hover:bg-retro-panel-dark/50'}`}
            >
              <Award size={16} />
              <span>Daily AI Digest</span>
            </button>
            <button
              onClick={() => setActiveTab('feeds')}
              className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center space-x-2 ${activeTab === 'feeds' ? 'bg-retro-panel-light dark:bg-retro-panel-dark font-medium text-retro-orange' : 'hover:bg-retro-panel-light/50 dark:hover:bg-retro-panel-dark/50'}`}
            >
              <Rss size={16} />
              <span>Feeds & Categories</span>
            </button>
            <div className="space-y-1">
              <button
                onClick={() => setIsSourcesExpanded(!isSourcesExpanded)}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center justify-between hover:bg-retro-panel-light/50 dark:hover:bg-retro-panel-dark/50`}
              >
                <div className="flex items-center space-x-2">
                  <Rss size={16} className="text-retro-orange" />
                  <span className="font-medium">RSS Sources</span>
                </div>
                <ChevronRight size={14} className={`transform transition-transform ${isSourcesExpanded ? 'rotate-90' : ''}`} />
              </button>
              
              {isSourcesExpanded && (
                <div className="pl-6 space-y-1 max-h-48 overflow-y-auto border-l border-retro-border-light/60 dark:border-retro-border-dark/60 ml-3">
                  {feeds.map((feed) => (
                    <button
                      key={feed.id}
                      onClick={() => {
                        setSelectedSource(feed);
                        setActiveTab('sources');
                      }}
                      className={`w-full text-left py-1 px-2 rounded text-xs transition-colors truncate block ${
                        activeTab === 'sources' && selectedSource?.id === feed.id
                          ? 'bg-retro-panel-light dark:bg-retro-panel-dark font-semibold text-retro-orange'
                          : 'hover:bg-retro-panel-light/30 dark:hover:bg-retro-panel-dark/30 opacity-80 hover:opacity-100'
                      }`}
                      title={feed.title}
                    >
                      {feed.title}
                    </button>
                  ))}
                  {feeds.length === 0 && (
                    <span className="text-[10px] opacity-50 block p-2">No sources</span>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={() => setActiveTab('tastes')}
              className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center space-x-2 ${activeTab === 'tastes' ? 'bg-retro-panel-light dark:bg-retro-panel-dark font-medium text-retro-orange' : 'hover:bg-retro-panel-light/50 dark:hover:bg-retro-panel-dark/50'}`}
            >
              <User size={16} />
              <span>Taste Profile</span>
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center space-x-2 ${activeTab === 'settings' ? 'bg-retro-panel-light dark:bg-retro-panel-dark font-medium text-retro-orange' : 'hover:bg-retro-panel-light/50 dark:hover:bg-retro-panel-dark/50'}`}
            >
              <SettingsIcon size={16} />
              <span>Settings</span>
            </button>
          </div>

          {/* Quick Filters - Only show when in Feed Curation tab */}
          {activeTab === 'feed' && (
            <>
              <div className="border-t border-retro-border-light dark:border-retro-border-dark pt-4 space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider opacity-60">Search Filter</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search articles..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-retro-panel-light dark:bg-retro-panel-dark border border-retro-border-light dark:border-retro-border-dark rounded focus:outline-none focus:border-retro-orange transition-colors"
                  />
                  <Search className="absolute left-3 top-2 text-retro-text-light/50 dark:text-retro-text-dark/50" size={14} />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider opacity-60 block mb-1">Interaction Filter</label>
                <div className="flex flex-col space-y-1">
                  {[
                    { id: '', label: 'All Articles' },
                    { id: 'suggested', label: 'AI Curated Suggestions' },
                    { id: 'favorite', label: 'Starred' },
                    { id: 'liked', label: 'Liked' },
                    { id: 'disliked', label: 'Disliked' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedStatus(s.id)}
                      className={`text-left px-3 py-1.5 rounded text-xs transition-colors flex items-center justify-between ${selectedStatus === s.id ? 'bg-retro-panel-light dark:bg-retro-panel-dark font-semibold text-retro-orange' : 'hover:bg-retro-panel-light/50 dark:hover:bg-retro-panel-dark/50'}`}
                    >
                      <span>{s.label}</span>
                      {selectedStatus === s.id && <Check size={12} />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider opacity-60 block mb-1">Category Filter</label>
                <div className="flex flex-col space-y-1">
                  <button
                    onClick={() => setSelectedCategoryId('')}
                    className={`text-left px-3 py-1.5 rounded text-xs transition-colors flex items-center justify-between ${!selectedCategoryId ? 'bg-retro-panel-light dark:bg-retro-panel-dark font-semibold text-retro-orange' : 'hover:bg-retro-panel-light/50 dark:hover:bg-retro-panel-dark/50'}`}
                  >
                    <span>All Categories</span>
                    {!selectedCategoryId && <Check size={12} />}
                  </button>
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCategoryId(c.id.toString())}
                      className={`text-left px-3 py-1.5 rounded text-xs transition-colors flex items-center justify-between ${selectedCategoryId === c.id.toString() ? 'bg-retro-panel-light dark:bg-retro-panel-dark font-semibold text-retro-orange' : 'hover:bg-retro-panel-light/50 dark:hover:bg-retro-panel-dark/50'}`}
                    >
                      <span>{c.name}</span>
                      {selectedCategoryId === c.id.toString() && <Check size={12} />}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </aside>

        {/* Scrollable Center Content Area */}
        <main className="flex-1 flex flex-col overflow-hidden bg-white/30 dark:bg-black/10">
          
          {/* TAB 1: CURATION FEED */}
          {activeTab === 'feed' && (
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {entries.length === 0 && !loading && (
                <div className="text-center py-12 bg-retro-panel-light/40 dark:bg-retro-panel-dark/40 rounded border border-retro-border-light dark:border-retro-border-dark p-8">
                  <Rss className="mx-auto mb-3 opacity-30" size={32} />
                  <p className="text-sm font-semibold opacity-70">No articles match your filters.</p>
                  <p className="text-xs opacity-50 mt-1">Try resetting search or polling feeds for updates.</p>
                </div>
              )}
              
              <div className="grid grid-cols-1 gap-4">
                {entries.map((entry) => (
                  <div 
                    key={entry.id} 
                    className={`p-5 rounded border bg-retro-bg-light/60 dark:bg-retro-panel-dark/60 hover:bg-retro-panel-light/60 dark:hover:bg-retro-panel-dark transition-all duration-150 animate-fade-in relative flex flex-col justify-between ${
                      entry.taste_suggested ? 'border-retro-orange/45 ring-1 ring-retro-orange/15 shadow-sm' : 'border-retro-border-light dark:border-retro-border-dark'
                    }`}
                  >
                    {entry.taste_suggested === 1 && (
                      <span className="absolute top-3 right-3 text-[10px] uppercase font-bold text-retro-orange bg-retro-orange/10 px-2 py-0.5 rounded flex items-center space-x-1">
                        <Sparkles size={8} />
                        <span>AI Choice</span>
                      </span>
                    )}

                    <div className="cursor-pointer flex flex-col md:flex-row gap-4" onClick={() => handleOpenDrawer(entry)}>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 text-[10px] uppercase font-semibold opacity-60 mb-1">
                          <span>{entry.feed_title}</span>
                          <span>•</span>
                          <span>{entry.published ? new Date(entry.published).toLocaleDateString() : 'Recent'}</span>
                          {entry.published_today === 1 && (
                            <>
                              <span>•</span>
                              <span className="text-[10px] uppercase font-bold text-retro-green bg-retro-green/15 px-1.5 py-0.25 rounded flex items-center space-x-1">
                                <span className="w-1 h-1 rounded-full bg-retro-green animate-pulse"></span>
                                <span>Today</span>
                              </span>
                            </>
                          )}
                        </div>
                        <h3 className="text-base font-bold tracking-tight mb-2 hover:text-retro-orange transition-colors">
                          {entry.title}
                        </h3>
                        <p className="text-xs opacity-85 leading-relaxed line-clamp-2">
                          {entry.summary ? entry.summary.replace(/<[^>]*>/g, '') : 'No summary provided.'}
                        </p>
                      </div>
                      {entry.image_url && (
                        <div className="w-full md:w-32 h-20 md:h-20 rounded overflow-hidden border border-retro-border-light/40 dark:border-retro-border-dark/40 flex-shrink-0">
                          <img 
                            src={entry.image_url} 
                            alt="Article preview" 
                            className="w-full h-full object-cover"
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                        </div>
                      )}
                    </div>

                    <div className="border-t border-retro-border-light/40 dark:border-retro-border-dark/40 pt-3 flex items-center justify-between">
                      {/* Action buttons */}
                      <div className="flex items-center space-x-2">
                        {/* Likes buttons */}
                        <button
                          onClick={() => handleLike(entry.id, entry.liked, 1)}
                          className={`p-1.5 rounded hover:bg-retro-panel-light dark:hover:bg-retro-panel-dark transition-colors ${entry.liked === 1 ? 'text-retro-green bg-retro-green/10 font-bold' : 'opacity-65'}`}
                          title="Like this article"
                        >
                          <ThumbsUp size={14} />
                        </button>
                        <button
                          onClick={() => handleLike(entry.id, entry.liked, -1)}
                          className={`p-1.5 rounded hover:bg-retro-panel-light dark:hover:bg-retro-panel-dark transition-colors ${entry.liked === -1 ? 'text-retro-red bg-retro-red/10 font-bold' : 'opacity-65'}`}
                          title="Dislike this article"
                        >
                          <ThumbsDown size={14} />
                        </button>
                        <button
                          onClick={() => handleFavorite(entry.id)}
                          className={`p-1.5 rounded hover:bg-retro-panel-light dark:hover:bg-retro-panel-dark transition-colors ${entry.favorite === 1 ? 'text-retro-yellow bg-retro-yellow/10 font-bold' : 'opacity-65'}`}
                          title="Star/Favorite this article"
                        >
                          <Star size={14} className={entry.favorite === 1 ? 'fill-retro-yellow' : ''} />
                        </button>
                      </div>

                      {/* Link tools */}
                      <div className="flex items-center space-x-2 text-xs opacity-75">
                        <button
                          onClick={() => handleShareLink(entry)}
                          className="p-1.5 hover:bg-retro-panel-light dark:hover:bg-retro-panel-dark rounded transition-colors flex items-center space-x-1"
                          title="Copy Link to Clipboard"
                        >
                          <Share2 size={13} />
                          <span className="hidden sm:inline">Share</span>
                        </button>
                        <button
                          onClick={() => handleOpenSource(entry)}
                          className="p-1.5 hover:bg-retro-panel-light dark:hover:bg-retro-panel-dark rounded transition-colors flex items-center space-x-1 text-retro-blue font-semibold"
                          title="Open article in web browser"
                        >
                          <ExternalLink size={13} />
                          <span className="hidden sm:inline">Open</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Load More Trigger */}
              <div ref={loaderRef} className="h-10 flex items-center justify-center">
                {loading && <RefreshCw className="animate-spin text-retro-orange opacity-70" size={20} />}
              </div>
            </div>
          )}

          {/* TAB 1b: RSS SOURCE VIEW */}
          {activeTab === 'sources' && selectedSource && (
            <div className="flex-1 flex flex-col h-full overflow-hidden select-text">
              {/* Top 1/3: Source Information */}
              <div className="h-1/3 border-b border-retro-border-light dark:border-retro-border-dark p-6 bg-retro-bg-light/40 dark:bg-retro-panel-dark/45 overflow-y-auto flex flex-col justify-between">
                <div>
                  <div className="flex items-center space-x-2 text-[10px] uppercase font-bold text-retro-orange mb-1">
                    <span>RSS Source Metadata</span>
                    {selectedSource.categories_str && (
                      <>
                        <span>•</span>
                        <span className="bg-retro-orange/10 px-2 py-0.5 rounded">{selectedSource.categories_str}</span>
                      </>
                    )}
                  </div>
                  <h2 className="text-xl font-bold tracking-tight mb-2">{selectedSource.title}</h2>
                  <p className="text-xs opacity-80 max-w-2xl leading-relaxed">
                    {selectedSource.description || selectedSource.subtitle || "No description available for this RSS source."}
                  </p>
                </div>
                
                <div className="text-xs opacity-60 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 pt-4 border-t border-retro-border-light/40 dark:border-retro-border-dark/40">
                  <div className="truncate">
                    <span className="font-semibold">Feed URL:</span> <span className="select-all font-mono">{selectedSource.feed_url}</span>
                  </div>
                  {selectedSource.link && (
                    <div>
                      <span className="font-semibold">Website:</span>{' '}
                      <a
                        href="#"
                        onClick={(e) => { e.preventDefault(); window.api.openUrl(selectedSource.link); }}
                        className="text-retro-blue hover:underline inline-flex items-center space-x-1"
                      >
                        <span>Visit site</span>
                        <ExternalLink size={10} />
                      </a>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Lower 2/3: Filtered Feed Entries */}
              <div className="h-2/3 flex flex-col overflow-hidden bg-white/20 dark:bg-black/5">
                <div className="px-6 py-4 border-b border-retro-border-light dark:border-retro-border-dark bg-retro-panel-light/30 dark:bg-retro-panel-dark/30 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider">Feed Articles ({sourceEntries.length})</span>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 space-y-4" onScroll={handleSourceScroll}>
                  {sourceEntries.length === 0 && !sourceLoading && (
                    <div className="text-center py-12 opacity-50">No articles found in this feed.</div>
                  )}
                  
                  <div className="grid grid-cols-1 gap-4">
                    {sourceEntries.map((entry) => (
                      <div 
                        key={entry.id}
                        onClick={() => handleOpenDrawer(entry)}
                        className={`p-4 bg-white/80 dark:bg-retro-panel-dark/80 border border-retro-border-light/70 dark:border-retro-border-dark hover:border-retro-orange cursor-pointer rounded transition-all flex flex-col justify-between ${
                          entry.taste_suggested ? 'border-retro-orange/45 ring-1 ring-retro-orange/15 shadow-sm' : ''
                        }`}
                      >
                        <div>
                          <div className="flex items-center space-x-2 text-[10px] uppercase font-semibold opacity-60 mb-1">
                            <span>{entry.published ? new Date(entry.published).toLocaleDateString() : 'Recent'}</span>
                            {entry.published_today === 1 && (
                              <>
                                <span>•</span>
                                <span className="text-[10px] uppercase font-bold text-retro-green bg-retro-green/15 px-1.5 py-0.25 rounded flex items-center space-x-1">
                                  <span className="w-1 h-1 rounded-full bg-retro-green animate-pulse"></span>
                                  <span>Today</span>
                                </span>
                              </>
                            )}
                          </div>
                          <h4 className="text-sm font-bold tracking-tight mb-1.5 hover:text-retro-orange transition-colors line-clamp-2">
                            {entry.title}
                          </h4>
                          <p className="text-xs opacity-80 leading-relaxed line-clamp-2">
                            {entry.summary ? entry.summary.replace(/<[^>]*>/g, '') : 'No summary.'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {sourceLoading && (
                    <div className="h-10 flex items-center justify-center">
                      <RefreshCw className="animate-spin text-retro-orange" size={20} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DAILY SUGGESTIONS DIGEST */}
          {activeTab === 'suggestions' && (
            <div className="flex-1 flex overflow-hidden">
              
              {/* Daily Reports Sub-List */}
              <div className="w-52 border-r border-retro-border-light dark:border-retro-border-dark flex flex-col overflow-y-auto">
                <div className="p-4 border-b border-retro-border-light dark:border-retro-border-dark bg-retro-bg-light/40 dark:bg-retro-panel-dark/40">
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">Select Report Date</span>
                </div>
                {dailyReports.length === 0 ? (
                  <div className="p-4 text-center text-xs opacity-50">No reports generated yet. Click "Generate AI Digest" above.</div>
                ) : (
                  dailyReports.map((rep) => (
                    <button
                      key={rep.date}
                      onClick={() => handleSelectReport(rep.date)}
                      className={`text-left p-4 border-b border-retro-border-light/60 dark:border-retro-border-dark/60 text-xs transition-colors flex items-center justify-between ${
                        selectedReportDate === rep.date ? 'bg-retro-panel-light dark:bg-retro-panel-dark font-bold text-retro-orange' : 'hover:bg-retro-panel-light/30 dark:hover:bg-retro-panel-dark/30'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <Calendar size={12} />
                        <span>{rep.date}</span>
                      </div>
                      <ChevronRight size={12} />
                    </button>
                  ))
                )}
              </div>

              {/* Report Viewer */}
              <div className="flex-1 flex flex-col overflow-hidden p-6 space-y-6">
                {loadingReportDetails ? (
                  <div className="flex-1 flex items-center justify-center">
                    <RefreshCw className="animate-spin text-retro-orange" size={24} />
                  </div>
                ) : selectedReportContent ? (
                  <div className="flex-1 flex flex-col md:flex-row gap-6 overflow-hidden">
                    
                    {/* Left: Summary Report Content */}
                    <div className="flex-1 border border-retro-border-light dark:border-retro-border-dark rounded p-6 bg-retro-bg-light/45 dark:bg-retro-panel-dark/45 overflow-y-auto flex flex-col space-y-3">
                      <div className="flex items-center space-x-2 text-retro-orange mb-1">
                        <Sparkles size={16} />
                        <h2 className="text-base font-bold uppercase tracking-wide">Daily Curation Digest Details</h2>
                      </div>
                      
                      {/* Render report text simply */}
                      <div className="text-xs opacity-90 leading-relaxed whitespace-pre-wrap select-text">
                        {selectedReportContent.report.report_content}
                      </div>
                    </div>

                    {/* Right: Suggested entries list */}
                    <div className="w-full md:w-80 flex flex-col overflow-hidden border border-retro-border-light dark:border-retro-border-dark rounded bg-retro-bg-light/25 dark:bg-retro-panel-dark/25">
                      <div className="p-4 border-b border-retro-border-light dark:border-retro-border-dark bg-retro-panel-light/50 dark:bg-retro-panel-dark/50 flex items-center space-x-2">
                        <Award size={14} className="text-retro-yellow" />
                        <span className="text-xs font-bold uppercase tracking-wider">AI Suggested Articles</span>
                      </div>

                      <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {selectedReportContent.entries.length === 0 ? (
                          <div className="text-center py-8 text-xs opacity-50">No suggested entries mapped.</div>
                        ) : (
                          selectedReportContent.entries.map((entry) => (
                            <div 
                              key={entry.id} 
                              onClick={() => handleOpenDrawer(entry)}
                              className="p-3 bg-white/70 dark:bg-retro-panel-dark border border-retro-border-light/70 dark:border-retro-border-dark hover:border-retro-orange cursor-pointer rounded transition-all flex flex-col space-y-1.5"
                            >
                              <div className="flex items-center justify-between text-[9px] uppercase opacity-60">
                                <span>{entry.feed_title}</span>
                              </div>
                              <h4 className="text-xs font-bold leading-snug line-clamp-2 hover:text-retro-orange">
                                {entry.title}
                              </h4>
                              {entry.taste_summary && (
                                <p className="text-[10px] text-retro-orange border-l-2 border-retro-orange/30 pl-2 italic opacity-95">
                                  {entry.taste_summary}
                                </p>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-center opacity-50 p-8">
                    <div>
                      <Award size={36} className="mx-auto mb-2" />
                      <p className="text-sm font-semibold">No daily digest selected.</p>
                      <p className="text-xs mt-1">Please select a report date on the left list, or click "Generate AI Digest" above.</p>
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* TAB 3: FEEDS & CATEGORIES MANAGEMENT */}
          {activeTab === 'feeds' && (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Top Forms */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Add Feed Form */}
                <div className="p-5 border border-retro-border-light dark:border-retro-border-dark bg-retro-bg-light/45 dark:bg-retro-panel-dark/45 rounded">
                  <h3 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center space-x-2">
                    <Plus size={16} />
                    <span>Register New RSS Feed</span>
                  </h3>
                  <form onSubmit={handleAddFeed} className="space-y-4">
                    <div>
                      <label className="text-xs opacity-75 block mb-1">RSS Feed Endpoint XML URL</label>
                      <input
                        type="url"
                        placeholder="https://example.com/feed.xml"
                        value={newFeedUrl}
                        onChange={(e) => setNewFeedUrl(e.target.value)}
                        required
                        className="w-full px-3 py-2 text-xs bg-white dark:bg-retro-panel-dark border border-retro-border-light dark:border-retro-border-dark rounded focus:outline-none focus:border-retro-orange"
                      />
                    </div>
                    <div>
                      <label className="text-xs opacity-75 block mb-1">Category (Optional)</label>
                      <select
                        value={newFeedCategory}
                        onChange={(e) => setNewFeedCategory(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-white dark:bg-retro-panel-dark border border-retro-border-light dark:border-retro-border-dark rounded focus:outline-none focus:border-retro-orange"
                      >
                        <option value="">Select Existing Category...</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="submit"
                      disabled={isAddingFeed}
                      className="w-full bg-retro-orange hover:bg-retro-orange/90 text-white font-semibold text-xs py-2 rounded transition-colors disabled:opacity-50 flex items-center justify-center space-x-1"
                    >
                      {isAddingFeed ? <RefreshCw className="animate-spin" size={12} /> : <Plus size={12} />}
                      <span>Add Feed Source</span>
                    </button>
                  </form>
                </div>

                {/* Add Category Form */}
                <div className="p-5 border border-retro-border-light dark:border-retro-border-dark bg-retro-bg-light/45 dark:bg-retro-panel-dark/45 rounded">
                  <h3 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center space-x-2">
                    <Plus size={16} />
                    <span>Create Category</span>
                  </h3>
                  <form onSubmit={handleAddCategory} className="space-y-4">
                    <div>
                      <label className="text-xs opacity-75 block mb-1">Category Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Science, Local Tech, Comics"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        required
                        className="w-full px-3 py-2 text-xs bg-white dark:bg-retro-panel-dark border border-retro-border-light dark:border-retro-border-dark rounded focus:outline-none focus:border-retro-orange"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isAddingCategory}
                      className="w-full bg-retro-panel-light dark:bg-retro-panel-dark border border-retro-border-light dark:border-retro-border-dark hover:border-retro-orange hover:text-retro-orange font-semibold text-xs py-2 rounded transition-colors disabled:opacity-50 flex items-center justify-center space-x-1"
                    >
                      {isAddingCategory ? <RefreshCw className="animate-spin" size={12} /> : <Plus size={12} />}
                      <span>Add Category</span>
                    </button>
                  </form>
                </div>

              </div>

              {/* Registered Feeds List */}
              <div className="border border-retro-border-light dark:border-retro-border-dark rounded overflow-hidden">
                <div className="p-4 bg-retro-panel-light/60 dark:bg-retro-panel-dark/60 border-b border-retro-border-light dark:border-retro-border-dark flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider">Active Curation Feed Sources</span>
                  <span className="text-[10px] opacity-60 font-semibold">{feeds.length} source feeds registered</span>
                </div>

                <div className="divide-y divide-retro-border-light/60 dark:divide-retro-border-dark/60 bg-white/20 dark:bg-black/5">
                  {feeds.length === 0 ? (
                    <div className="p-6 text-center text-xs opacity-50">No feed sources registered. Feed pool is empty.</div>
                  ) : (
                    feeds.map((feed) => (
                      <div key={feed.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-xs">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-sm tracking-tight">{feed.title}</span>
                            {feed.categories_str && (
                              <span className="text-[9px] font-bold text-retro-orange bg-retro-orange/10 px-2 py-0.5 rounded">
                                {feed.categories_str}
                              </span>
                            )}
                          </div>
                          <div className="opacity-60 overflow-hidden text-ellipsis whitespace-nowrap max-w-lg">
                            {feed.feed_url}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteFeed(feed.id)}
                          className="self-start sm:self-center text-retro-red hover:bg-retro-red/10 p-2 rounded transition-colors"
                          title="Delete feed and all related articles"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          )}

          {/* TAB 4: TASTE PROFILE / MD EDITORS */}
          {activeTab === 'tastes' && (
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden p-6 gap-6">
              
              {/* Left: User Interests Editor */}
              <div className="flex-1 flex flex-col overflow-hidden border border-retro-border-light dark:border-retro-border-dark rounded bg-retro-bg-light/40 dark:bg-retro-panel-dark/40">
                <div className="p-4 border-b border-retro-border-light dark:border-retro-border-dark bg-retro-panel-light/60 dark:bg-retro-panel-dark/60 flex items-center justify-between">
                  <div className="flex items-center space-x-2 font-bold text-xs uppercase tracking-wider">
                    <Edit2 size={14} />
                    <span>user_interests.md (Editable)</span>
                  </div>
                  <button
                    onClick={handleSaveInterests}
                    disabled={isSavingInterests}
                    className="bg-retro-green hover:bg-retro-green/90 text-white font-semibold text-[10px] px-3 py-1 rounded disabled:opacity-50 flex items-center space-x-1"
                  >
                    {isSavingInterests ? <RefreshCw size={10} className="animate-spin" /> : <Check size={10} />}
                    <span>Save Interests</span>
                  </button>
                </div>
                <textarea
                  value={userInterests}
                  onChange={(e) => setUserInterests(e.target.value)}
                  className="flex-1 p-4 text-xs font-mono bg-white dark:bg-retro-panel-dark/40 border-0 focus:outline-none resize-none select-text"
                  placeholder="Define your interests here..."
                />
              </div>

              {/* Right: Agent Generated User Tastes Viewer */}
              <div className="flex-1 flex flex-col overflow-hidden border border-retro-border-light dark:border-retro-border-dark rounded bg-retro-bg-light/45 dark:bg-retro-panel-dark/45">
                <div className="p-4 border-b border-retro-border-light dark:border-retro-border-dark bg-retro-panel-light/60 dark:bg-retro-panel-dark/60 flex items-center justify-between">
                  <div className="flex items-center space-x-2 font-bold text-xs uppercase tracking-wider text-retro-orange">
                    <Sparkles size={14} />
                    <span>agent_user_tastes.md (AI-Generated)</span>
                  </div>
                  <button
                    onClick={handleTriggerAgent}
                    disabled={runningAgent}
                    className="bg-retro-orange hover:bg-retro-orange/90 text-white font-semibold text-[10px] px-3 py-1 rounded disabled:opacity-50"
                  >
                    Update Tastes Now
                  </button>
                </div>
                <div className="flex-1 p-5 overflow-y-auto text-xs leading-relaxed whitespace-pre-wrap select-text bg-white dark:bg-retro-panel-dark/40 font-mono">
                  {agentTastes || "No tastes profile file generated yet. Tap 'Update Tastes Now' to compile your profile from your interactions."}
                </div>
              </div>

            </div>
          )}

          {/* TAB 5: AI & GOTIFY SETTINGS */}
          {activeTab === 'settings' && (
            <div className="flex-1 overflow-y-auto p-6 max-w-xl">
              <div className="border border-retro-border-light dark:border-retro-border-dark rounded bg-retro-bg-light/45 dark:bg-retro-panel-dark/45 p-6 space-y-6">
                <h3 className="text-sm font-bold uppercase tracking-wider border-b border-retro-border-light/60 dark:border-retro-border-dark/60 pb-3 flex items-center space-x-2">
                  <SettingsIcon size={16} />
                  <span>AI and Notification Configurations</span>
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs opacity-75 font-semibold block mb-1">Ollama Host Connection</label>
                    <input
                      type="text"
                      placeholder="e.g. 192.168.0.25:11434"
                      value={settingsHost}
                      onChange={(e) => setSettingsHost(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-retro-panel-dark border border-retro-border-light dark:border-retro-border-dark rounded focus:outline-none focus:border-retro-orange"
                    />
                  </div>

                  <div>
                    <label className="text-xs opacity-75 font-semibold block mb-1">Ollama Model Name</label>
                    <input
                      type="text"
                      placeholder="gemma4"
                      value={settingsModel}
                      onChange={(e) => setSettingsModel(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-retro-panel-dark border border-retro-border-light dark:border-retro-border-dark rounded focus:outline-none focus:border-retro-orange"
                    />
                  </div>

                  <div className="border-t border-retro-border-light/60 dark:border-retro-border-dark/60 pt-4">
                    <label className="text-xs opacity-75 font-semibold block mb-1">Gotify Server URL</label>
                    <input
                      type="url"
                      placeholder="https://gotify.example.com"
                      value={settingsGotifyUrl}
                      onChange={(e) => setSettingsGotifyUrl(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-retro-panel-dark border border-retro-border-light dark:border-retro-border-dark rounded focus:outline-none focus:border-retro-orange"
                    />
                  </div>

                  <div>
                    <label className="text-xs opacity-75 font-semibold block mb-1">Gotify App Message Token</label>
                    <input
                      type="password"
                      placeholder="Gotify Token"
                      value={settingsGotifyToken}
                      onChange={(e) => setSettingsGotifyToken(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-retro-panel-dark border border-retro-border-light dark:border-retro-border-dark rounded focus:outline-none focus:border-retro-orange"
                    />
                  </div>

                  <div className="border-t border-retro-border-light/60 dark:border-retro-border-dark/60 pt-4">
                    <label className="text-xs opacity-75 font-semibold block mb-1">kb-web Server URL</label>
                    <input
                      type="url"
                      placeholder="http://localhost:8050"
                      value={settingsKbWebUrl}
                      onChange={(e) => setSettingsKbWebUrl(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-retro-panel-dark border border-retro-border-light dark:border-retro-border-dark rounded focus:outline-none focus:border-retro-orange"
                    />
                  </div>

                  <div>
                    <label className="text-xs opacity-75 font-semibold block mb-1">kb-web Ingestion API Key</label>
                    <input
                      type="password"
                      placeholder="kb-secret-key"
                      value={settingsKbWebApiKey}
                      onChange={(e) => setSettingsKbWebApiKey(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-retro-panel-dark border border-retro-border-light dark:border-retro-border-dark rounded focus:outline-none focus:border-retro-orange"
                    />
                  </div>

                  <button
                    onClick={handleSaveSettings}
                    disabled={savingSettings}
                    className="w-full bg-retro-orange hover:bg-retro-orange/90 text-white font-semibold text-xs py-2.5 rounded transition-colors disabled:opacity-50 flex items-center justify-center space-x-1"
                  >
                    {savingSettings ? <RefreshCw className="animate-spin" size={12} /> : <Check size={12} />}
                    <span>Save Configuration</span>
                  </button>
                </div>
              </div>
            </div>
          )}

        </main>

        {/* Right-Side Sliding Drawer for Details */}
        <div className={`fixed top-0 right-0 h-screen bg-retro-panel-light dark:bg-retro-panel-dark border-l border-retro-border-light dark:border-retro-border-dark shadow-2xl z-50 transform transition-transform duration-300 flex flex-col overflow-hidden ${
          drawerExpanded ? 'w-[75vw]' : 'w-96'
        } ${
          selectedEntry ? 'translate-x-0' : 'translate-x-full'
        }`}>
          {selectedEntry && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Drawer Header */}
              <div className="p-4 border-b border-retro-border-light dark:border-retro-border-dark flex items-center justify-between bg-retro-bg-light/60 dark:bg-retro-bg-dark/40">
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-60 text-retro-orange">Article Details</span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setDrawerExpanded(!drawerExpanded)}
                    className="hover:text-retro-orange p-1 rounded transition-colors text-xs font-semibold"
                    title={drawerExpanded ? "Contract Details View" : "Expand Details View"}
                  >
                    {drawerExpanded ? "Collapse" : "Expand"}
                  </button>
                  <span className="opacity-30 text-xs">|</span>
                  <button
                    onClick={() => {
                      setSelectedEntry(null);
                      setDrawerExpanded(false);
                    }}
                    className="hover:text-retro-red p-1 rounded transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Drawer Tabs */}
              <div className="flex border-b border-retro-border-light dark:border-retro-border-dark bg-retro-bg-light/40 dark:bg-retro-bg-dark/20 text-xs">
                <button
                  onClick={() => setDrawerMode('summary')}
                  className={`flex-1 py-2 text-center font-semibold transition-colors border-b-2 ${
                    drawerMode === 'summary' 
                      ? 'border-retro-orange text-retro-orange bg-retro-panel-light/35 dark:bg-retro-panel-dark/35' 
                      : 'border-transparent opacity-70 hover:opacity-100'
                  }`}
                >
                  Summary Mode
                </button>
                <button
                  onClick={() => setDrawerMode('web')}
                  className={`flex-1 py-2 text-center font-semibold transition-colors border-b-2 ${
                    drawerMode === 'web' 
                      ? 'border-retro-orange text-retro-orange bg-retro-panel-light/35 dark:bg-retro-panel-dark/35' 
                      : 'border-transparent opacity-70 hover:opacity-100'
                  }`}
                >
                  Web Preview
                </button>
              </div>

              {/* Drawer Content */}
              {drawerMode === 'web' ? (
                <div className="flex-1 w-full bg-white relative">
                  <webview 
                    ref={webviewRef}
                    src={selectedEntry.link} 
                    className="w-full h-full border-0" 
                    title="Article Web View"
                    style={{ width: '100%', height: '100%' }}
                  />
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  
                  {/* Image header if available */}
                  {selectedEntry.image_url && (
                    <div className="w-full h-40 rounded overflow-hidden border border-retro-border-light/60 dark:border-retro-border-dark/60 mb-4 flex-shrink-0">
                      <img 
                        src={selectedEntry.image_url} 
                        alt="Article header" 
                        className="w-full h-full object-cover"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    </div>
                  )}

                  {/* Meta details */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px] uppercase font-bold opacity-60">
                      <span>{selectedEntry.feed_title}</span>
                      <div className="flex items-center space-x-2">
                        {selectedEntry.published_today === 1 && (
                          <span className="text-[9px] uppercase font-bold text-retro-green bg-retro-green/15 px-1.5 py-0.25 rounded flex items-center space-x-1">
                            <span className="w-1 h-1 rounded-full bg-retro-green animate-pulse"></span>
                            <span>Today</span>
                          </span>
                        )}
                        <span>{selectedEntry.published ? new Date(selectedEntry.published).toLocaleDateString() : 'Recent'}</span>
                      </div>
                    </div>
                    <h2 className="text-base font-bold tracking-tight leading-snug">
                      {selectedEntry.title}
                    </h2>
                    {selectedEntry.author && (
                      <div className="text-xs opacity-75">
                        <span>Author: </span>
                        <span className="font-semibold">{selectedEntry.author}</span>
                      </div>
                    )}
                  </div>

                  {/* AI Selection callout */}
                  {selectedEntry.taste_suggested === 1 && selectedEntry.taste_summary && (
                    <div className="p-4 border border-retro-orange/30 bg-retro-orange/5 rounded flex flex-col space-y-2">
                      <div className="flex items-center space-x-1.5 text-retro-orange text-[10px] font-bold uppercase">
                        <Sparkles size={12} />
                        <span>AI Curation Rationale</span>
                      </div>
                      <p className="text-xs italic opacity-95 leading-relaxed">
                        "{selectedEntry.taste_summary}"
                      </p>
                    </div>
                  )}

                  {/* Article description summary or full content */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-retro-border-light/60 dark:border-retro-border-dark/60 pb-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider opacity-60 block">
                        {selectedEntry.full_content ? 'Full Reader Content' : 'Article Summary'}
                      </label>
                      {selectedEntry.full_content && (
                        <span className="text-[9px] uppercase font-bold text-retro-green bg-retro-green/10 px-2 py-0.5 rounded">Cached Offline</span>
                      )}
                    </div>
                    
                    {selectedEntry.full_content ? (
                      (selectedEntry.full_content.trim().toLowerCase().startsWith("<!doctype") || 
                       selectedEntry.full_content.trim().toLowerCase().startsWith("<html") ||
                       selectedEntry.full_content.includes("<body") ||
                       selectedEntry.full_content.includes("</html")) ? (
                        <div className="space-y-3">
                          <div className="p-3 bg-retro-panel-light/45 dark:bg-retro-panel-dark/45 border border-retro-border-light dark:border-retro-border-dark rounded text-[11px] opacity-80">
                            <p className="font-semibold text-retro-orange">Raw HTML Offline Copy Available</p>
                            <p className="mt-0.5">This article's full HTML page was exported from the webview and saved offline.</p>
                          </div>
                          <iframe 
                            srcDoc={selectedEntry.full_content} 
                            className="w-full h-[55vh] border border-retro-border-light dark:border-retro-border-dark rounded bg-white" 
                            sandbox="allow-same-origin"
                          />
                        </div>
                      ) : (
                        <div 
                          className="text-xs opacity-95 leading-relaxed select-text space-y-3 prose dark:prose-invert max-w-none reader-view"
                          dangerouslySetInnerHTML={{ __html: selectedEntry.full_content }}
                        />
                      )
                    ) : (
                      <div className="space-y-4">
                        <div 
                          className="text-xs opacity-90 leading-relaxed whitespace-pre-wrap select-text"
                          dangerouslySetInnerHTML={{ __html: selectedEntry.summary || 'No summary text.' }}
                        />
                        
                        {/* Scrape button */}
                        <div className="p-4 bg-retro-panel-light/60 dark:bg-retro-panel-dark/60 border border-retro-border-light dark:border-retro-border-dark rounded flex flex-col items-center justify-center text-center space-y-2">
                          <BookOpen size={20} className="opacity-55 text-retro-orange" />
                          <div className="text-[11px]">
                            <p className="font-semibold">Full Reader View is available.</p>
                            <p className="opacity-60 mt-0.5">Scrape and cache the full clean text of this web page.</p>
                          </div>
                          <button
                            onClick={() => handleScrapeArticle(selectedEntry.id)}
                            disabled={scrapingArticle}
                            className="bg-retro-orange hover:bg-retro-orange/90 text-white font-semibold text-xs px-4 py-2 rounded transition-colors disabled:opacity-50 flex items-center justify-center space-x-1"
                          >
                            {scrapingArticle ? <RefreshCw className="animate-spin" size={12} /> : <BookOpen size={12} />}
                            <span>{scrapingArticle ? 'Fetching Text...' : 'Load Reader View'}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Comments box */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold uppercase tracking-wider opacity-60 block border-b border-retro-border-light/60 dark:border-retro-border-dark/60 pb-1">User Notes & Comments</label>
                    <textarea
                      value={drawerComment}
                      onChange={(e) => setDrawerComment(e.target.value)}
                      placeholder="Type comments or tags here..."
                      className="w-full p-3 text-xs bg-white dark:bg-retro-panel-dark/40 border border-retro-border-light dark:border-retro-border-dark rounded focus:outline-none focus:border-retro-orange h-20 resize-none"
                    />
                    <button
                      onClick={handleSaveComment}
                      disabled={isSavingComment}
                      className="w-full bg-retro-orange hover:bg-retro-orange/90 text-white font-semibold text-xs py-2 rounded transition-colors disabled:opacity-50 flex items-center justify-center space-x-1"
                    >
                      {isSavingComment ? <RefreshCw className="animate-spin" size={12} /> : <Check size={12} />}
                      <span>Save Notes</span>
                    </button>
                  </div>

                  {/* Interaction log stats */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider opacity-60 block border-b border-retro-border-light/60 dark:border-retro-border-dark/60 pb-1">Interaction Stats</label>
                    <div className="grid grid-cols-2 gap-4 text-xs bg-retro-bg-light/60 dark:bg-retro-bg-dark/40 p-3 rounded">
                      <div>
                        <span className="opacity-75">Link Clicks: </span>
                        <span className="font-bold">{selectedEntry.clicked || 0}</span>
                      </div>
                      <div>
                        <span className="opacity-75">Copied Shares: </span>
                        <span className="font-bold">{selectedEntry.shared || 0}</span>
                      </div>
                    </div>
                  </div>

                  {/* kb-web Integration */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider opacity-60 block border-b border-retro-border-light/60 dark:border-retro-border-dark/60 pb-1">kb-web Integration</label>
                    <button
                      onClick={() => handleImportToWeb(selectedEntry.id)}
                      disabled={importingToWeb}
                      className="w-full bg-retro-panel-light dark:bg-retro-panel-dark border border-retro-border-light dark:border-retro-border-dark hover:border-retro-orange hover:text-retro-orange font-semibold text-xs py-2 rounded transition-colors disabled:opacity-50 flex items-center justify-center space-x-1"
                    >
                      {importingToWeb ? <RefreshCw className="animate-spin" size={12} /> : <Share2 size={12} />}
                      <span>{importingToWeb ? 'Importing...' : 'Import to kb-web'}</span>
                    </button>
                  </div>

                </div>
              )}

              {/* Drawer Footer Actions */}
              <div className="p-4 border-t border-retro-border-light dark:border-retro-border-dark bg-retro-bg-light/60 dark:bg-retro-bg-dark/45 grid grid-cols-5 gap-2 flex-shrink-0">
                <button
                  onClick={() => handleLike(selectedEntry.id, selectedEntry.liked, 1)}
                  className={`p-2 rounded hover:bg-retro-panel-light dark:hover:bg-retro-bg-dark transition-colors flex items-center justify-center ${selectedEntry.liked === 1 ? 'text-retro-green bg-retro-green/10 font-bold' : 'opacity-70'}`}
                  title="Like article"
                >
                  <ThumbsUp size={16} />
                </button>
                <button
                  onClick={() => handleLike(selectedEntry.id, selectedEntry.liked, -1)}
                  className={`p-2 rounded hover:bg-retro-panel-light dark:hover:bg-retro-bg-dark transition-colors flex items-center justify-center ${selectedEntry.liked === -1 ? 'text-retro-red bg-retro-red/10 font-bold' : 'opacity-70'}`}
                  title="Dislike article"
                >
                  <ThumbsDown size={16} />
                </button>
                <button
                  onClick={() => handleFavorite(selectedEntry.id)}
                  className={`p-2 rounded hover:bg-retro-panel-light dark:hover:bg-retro-bg-dark transition-colors flex items-center justify-center ${selectedEntry.favorite === 1 ? 'text-retro-yellow bg-retro-yellow/10 font-bold' : 'opacity-70'}`}
                  title="Star/Favorite article"
                >
                  <Star size={16} className={selectedEntry.favorite === 1 ? 'fill-retro-yellow' : ''} />
                </button>
                <button
                  onClick={() => handleShareLink(selectedEntry)}
                  className="p-2 rounded hover:bg-retro-panel-light dark:hover:bg-retro-bg-dark transition-colors flex items-center justify-center opacity-70"
                  title="Copy URL"
                >
                  <Share2 size={16} />
                </button>
                <button
                  onClick={() => handleOpenSource(selectedEntry)}
                  className="p-2 rounded hover:bg-retro-panel-light dark:hover:bg-retro-bg-dark transition-colors flex items-center justify-center text-retro-blue font-bold"
                  title="Open in native web browser"
                >
                  <ExternalLink size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
