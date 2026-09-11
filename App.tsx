
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search, Plus, Upload, Moon, Sun, Menu,
  Trash2, Edit2, Loader2, Cloud, CheckCircle2, AlertCircle,
  Pin, Settings, Lock, CloudCog, GitFork,
  QrCode, Copy, LayoutGrid, List, ArrowRight, X, GripVertical, LogOut
} from 'lucide-react';
import {
    LinkItem, Category, DEFAULT_CATEGORIES, INITIAL_LINKS,
    WebDavConfig, AIConfig, SiteSettings, SearchEngine, DEFAULT_SEARCH_ENGINES
} from './types';
import { createEdgeOneService } from './services/edgeoneService';
import Icon from './components/Icon';
import LinkModal from './components/LinkModal';
import AuthModal from './components/AuthModal';
import CategoryManagerModal from './components/CategoryManagerModal';
import CategoryEditModal from './components/CategoryEditModal';
import BackupModal from './components/BackupModal';
import CategoryAuthModal from './components/CategoryAuthModal';
import ImportModal from './components/ImportModal';
import SettingsModal from './components/SettingsModal';
import SearchSettingsModal from './components/SearchSettingsModal';
import DeleteConfirmModal from './components/DeleteConfirmModal';
import { CategoryContextMenu } from './components/CategoryContextMenu';
import { CategorySortModal } from './components/CategorySortModal';
import { SortableLinkList } from './components/SortableLinkList';

const GITHUB_REPO_URL = 'https://github.com/sese972010/HaoNav';

const LOCAL_STORAGE_KEY = 'cloudnav_data_cache';
const AUTH_KEY = 'cloudnav_auth_token';
const WEBDAV_CONFIG_KEY = 'cloudnav_webdav_config';
const AI_CONFIG_KEY = 'cloudnav_ai_config';
const SEARCH_ENGINES_KEY = 'cloudnav_search_engines';
const ACTIVE_CATEGORY_KEY = 'cloudnav_active_category';

// 检测是否运行在 EdgeOne Pages 环境
const IS_EDGEONE_ENV = typeof window !== 'undefined' && window.location.hostname.includes('edgeone.app');

function App() {
  // --- 从 localStorage 初始化设置，避免标题和图标闪烁 ---
  if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
          try {
              const parsed = JSON.parse(stored);
              if (parsed.settings) {
                  if (parsed.settings.title) {
                      document.title = parsed.settings.title;
                  }
                  if (parsed.settings.favicon) {
                      const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
                      if (link) {
                          link.href = parsed.settings.favicon;
                      }
                  }
              }
          } catch (e) {}
      }
  }

  // --- State ---
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>(() => {
      if (typeof window !== 'undefined') {
          const saved = localStorage.getItem(ACTIVE_CATEGORY_KEY);
          if (saved) return saved;
      }
      return 'all';
  }); 
  const [searchQuery, setSearchQuery] = useState('');
  
  // New Search State
  const [searchMode, setSearchMode] = useState<'local' | 'external'>('local');
  const [externalEngines, setExternalEngines] = useState<SearchEngine[]>(() => {
      const saved = localStorage.getItem(SEARCH_ENGINES_KEY);
      if (saved) {
          try { return JSON.parse(saved); } catch(e) {}
      }
      // Filter out 'local' from defaults for the external list
      return DEFAULT_SEARCH_ENGINES.filter(e => e.id !== 'local');
  });
  const [activeEngineId, setActiveEngineId] = useState<string>(() => {
      return externalEngines[0]?.id || 'google';
  });
  const [isSearchSettingsOpen, setIsSearchSettingsOpen] = useState(false);
  const [showEngineSelector, setShowEngineSelector] = useState(false);

  const [darkMode, setDarkMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // 初始配置 - 与 index.html 中的配置保持一致
  const INITIAL_SITE_CONFIG = {
      title: 'HaoNav',
      navTitle: 'HaoNav',
      favicon: '',
      cardStyle: 'detailed'
  };

  // Site Settings - 初始化时优先使用 localStorage，否则使用初始配置
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(() => {
      if (typeof window !== 'undefined') {
          const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
          if (stored) {
              try {
                  const parsed = JSON.parse(stored);
                  return {
                      title: parsed.settings?.title || INITIAL_SITE_CONFIG.title,
                      navTitle: parsed.settings?.navTitle || INITIAL_SITE_CONFIG.navTitle,
                      favicon: parsed.settings?.favicon || INITIAL_SITE_CONFIG.favicon,
                      cardStyle: parsed.settings?.cardStyle || INITIAL_SITE_CONFIG.cardStyle
                  };
              } catch (e) {}
          }
      }
      return INITIAL_SITE_CONFIG;
  });
  
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, link: LinkItem | null, categoryId: string | null } | null>(null);
  const [categoryContextMenu, setCategoryContextMenu] = useState<{ x: number, y: number, category: Category | null } | null>(null);
  
  // Drag and Sort State
  const [isSorting, setIsSorting] = useState<{categoryId: string | null, type: 'links' | 'categories'} | null>(null);
  
  const [qrCodeLink, setQrCodeLink] = useState<LinkItem | null>(null);

  const [showCopySuccess, setShowCopySuccess] = useState(false);
  const [copiedLinkTitle, setCopiedLinkTitle] = useState('');
  const [copiedLinkUrl, setCopiedLinkUrl] = useState('');
  const [toastKey, setToastKey] = useState(0);

  const [unlockedCategoryIds, setUnlockedCategoryIds] = useState<Set<string>>(new Set());

  const [webDavConfig, setWebDavConfig] = useState<WebDavConfig>({
      url: '',
      username: '',
      password: '',
      enabled: false
  });

  const [aiConfig, setAiConfig] = useState<AIConfig>(() => {
      const saved = localStorage.getItem(AI_CONFIG_KEY);
      if (saved) {
          try {
              return JSON.parse(saved);
          } catch (e) {}
      }
      
      // Safe access to process env
      let defaultKey = '';
      try {
          if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
              defaultKey = process.env.API_KEY;
          }
      } catch(e) {}

      return {
          provider: 'gemini',
          apiKey: defaultKey, 
          baseUrl: '',
          model: 'gemini-2.5-flash'
      };
  });
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isCatManagerOpen, setIsCatManagerOpen] = useState(false);
  const [isCatEditModalOpen, setIsCatEditModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [catAuthModalData, setCatAuthModalData] = useState<Category | null>(null);
  const [isCategorySortModalOpen, setIsCategorySortModalOpen] = useState(false);
  const [deleteConfirmData, setDeleteConfirmData] = useState<{ type: 'link' | 'category', id: string, name: string } | null>(null);

  const [editingLink, setEditingLink] = useState<LinkItem | undefined>(undefined);
  const [prefillLink, setPrefillLink] = useState<Partial<LinkItem> | undefined>(undefined);
  const [editingCategory, setEditingCategory] = useState<Category | undefined>(undefined);
  
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [authToken, setAuthToken] = useState<string>('');

  const mainRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isAutoScrollingRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const engineSelectorRef = useRef<HTMLDivElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // --- Helpers ---

  const hideLoadingOverlay = () => {
      const overlay = document.getElementById('loading-overlay');
      const root = document.getElementById('root');
      if (overlay && root) {
          overlay.style.opacity = '0';
          setTimeout(() => {
              overlay.style.display = 'none';
              root.style.display = 'block';
          }, 300);
      }
  };

  const loadFromLocal = () => {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setLinks(parsed.links || INITIAL_LINKS);
        setCategories(parsed.categories || DEFAULT_CATEGORIES);
        if (parsed.settings) setSiteSettings(prev => ({ ...prev, ...parsed.settings }));
      } catch (e) {
        setLinks(INITIAL_LINKS);
        setCategories(DEFAULT_CATEGORIES);
      }
    } else {
      setLinks(INITIAL_LINKS);
      setCategories(DEFAULT_CATEGORIES);
    }
    hideLoadingOverlay();
  };

  const syncToCloud = async (newLinks: LinkItem[], newCategories: Category[], newSettings: SiteSettings, token: string) => {
    setSyncStatus('saving');
    try {
        if (IS_EDGEONE_ENV) {
            // 使用 EdgeOne KV 服务
            const service = createEdgeOneService(token);
            const success = await service.saveAll({
                links: newLinks,
                categories: newCategories,
                settings: newSettings,
                searchEngines: externalEngines
            });

            if (success) {
                setSyncStatus('saved');
                setTimeout(() => setSyncStatus('idle'), 2000);
                return true;
            } else {
                setSyncStatus('error');
                return false;
            }
        } else {
            // 原有的存储方式
            const response = await fetch('/api/storage', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-auth-password': token
                },
                body: JSON.stringify({ links: newLinks, categories: newCategories, settings: newSettings })
            });

            if (response.status === 401) {
                setAuthToken('');
                localStorage.removeItem(AUTH_KEY);
                setIsAuthOpen(true);
                setSyncStatus('error');
                return false;
            }

            if (!response.ok) throw new Error('Network response was not ok');

            setSyncStatus('saved');
            setTimeout(() => setSyncStatus('idle'), 2000);
            return true;
        }
    } catch (error) {
        console.error("Sync failed", error);
        setSyncStatus('error');
        return false;
    }
  };

  const updateData = (newLinks: LinkItem[], newCategories: Category[], newSettings: SiteSettings = siteSettings) => {
      setLinks(newLinks);
      setCategories(newCategories);
      setSiteSettings(newSettings);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ links: newLinks, categories: newCategories, settings: newSettings }));
      if (authToken) {
          syncToCloud(newLinks, newCategories, newSettings, authToken);
      }
  };

  useEffect(() => {
    if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    }
    const savedToken = localStorage.getItem(AUTH_KEY);
    if (savedToken) setAuthToken(savedToken);

    const savedWebDav = localStorage.getItem(WEBDAV_CONFIG_KEY);
    if (savedWebDav) {
        try {
            setWebDavConfig(JSON.parse(savedWebDav));
        } catch (e) {}
    }

    const urlParams = new URLSearchParams(window.location.search);
    const addUrl = urlParams.get('add_url');
    if (addUrl) {
        const addTitle = urlParams.get('add_title') || '';
        window.history.replaceState({}, '', window.location.pathname);
        setPrefillLink({
            title: addTitle,
            url: addUrl,
            categoryId: 'common'
        });
        setEditingLink(undefined);
        setIsModalOpen(true);
    }

    const initData = async () => {
        try {
            if (IS_EDGEONE_ENV && authToken) {
                // 使用 EdgeOne KV 服务
                const service = createEdgeOneService(authToken);
                const data = await service.loadAll();
                if (data.links && data.links.length > 0) {
                    // 云端有数据，使用云端数据（包括设置）
                    setLinks(data.links);
                    setCategories(data.categories || DEFAULT_CATEGORIES);
                    if (data.settings) setSiteSettings(prev => ({ ...prev, ...data.settings }));
                    if (data.searchEngines) setExternalEngines(data.searchEngines);
                    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
                    hideLoadingOverlay();
                    return;
                }
                // 云端没有数据，使用本地数据（首次部署的情况）
                loadFromLocal();
            } else {
                const res = await fetch('/api/storage');
                if (res.ok) {
                    const data = await res.json();
                    if (data.links && data.links.length > 0) {
                        // 云端有数据，使用云端数据（包括设置）
                        setLinks(data.links);
                        setCategories(data.categories || DEFAULT_CATEGORIES);
                        if (data.settings) setSiteSettings(prev => ({ ...prev, ...data.settings }));
                        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
                        hideLoadingOverlay();
                        return;
                    }
                }
                // 云端没有数据，使用本地数据（首次部署的情况）
                loadFromLocal();
            }
        } catch (e) {
            console.warn("Failed to fetch from cloud, falling back to local.", e);
            loadFromLocal();
        }
        // 如果没有 authToken 或云端请求失败，最终都会调用 loadFromLocal
    };

    initData();
  }, []);

  useEffect(() => {
      document.title = siteSettings.title || 'HaoNav';
      const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (link && siteSettings.favicon) {
          link.href = siteSettings.favicon;
      }
  }, [siteSettings]);

  useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
          if (openMenuId) setOpenMenuId(null);
          if (contextMenu && contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
             setContextMenu(null);
          }
          if (categoryContextMenu) {
             setCategoryContextMenu(null);
          }
          if (showEngineSelector && engineSelectorRef.current && !engineSelectorRef.current.contains(e.target as Node)) {
             setShowEngineSelector(false);
          }
      };

      window.addEventListener('click', handleClickOutside);

      const handleGlobalContextMenu = (e: MouseEvent) => {
          // 只在点击菜单外部时关闭菜单，而不是每次右键都关闭
          // 让具体的onContextMenu处理器来决定是否打开新菜单
          const target = e.target as Node;

          if (contextMenuRef.current && contextMenu && !contextMenuRef.current.contains(target)) {
              setContextMenu(null);
          }
          if (categoryContextMenu) {
              setCategoryContextMenu(null);
          }
          if (showEngineSelector && engineSelectorRef.current && !engineSelectorRef.current.contains(target)) {
              setShowEngineSelector(false);
          }
      }
      window.addEventListener('contextmenu', handleGlobalContextMenu);

      return () => {
          window.removeEventListener('click', handleClickOutside);
          window.removeEventListener('contextmenu', handleGlobalContextMenu);
      }
  }, [openMenuId, contextMenu, categoryContextMenu, showEngineSelector]);

  useEffect(() => {
    const handleScroll = () => {
        if (isAutoScrollingRef.current) return;
        if (!contentRef.current) return;

        const scrollPosition = contentRef.current.scrollTop + 150;

        if (contentRef.current.scrollTop < 80) {
            // setActiveCategory('all');  // 临时禁用
            return;
        }

        let currentCatId = 'all';
        for (const cat of categories) {
            const el = document.getElementById(`cat-${cat.id}`);
            if (el && el.offsetTop <= scrollPosition && (el.offsetTop + el.offsetHeight) > scrollPosition) {
                currentCatId = cat.id;
                break;
            }
        }
        // if (currentCatId !== 'all') setActiveCategory(currentCatId);  // 临时禁用
    };

    const contentEl = contentRef.current;
    if (contentEl) {
        contentEl.addEventListener('scroll', handleScroll, { passive: true });
    }
    return () => contentEl?.removeEventListener('scroll', handleScroll);
  }, [categories]);

  const toggleTheme = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    if (newMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  // 保存当前选择的分类到 localStorage
  useEffect(() => {
      localStorage.setItem(ACTIVE_CATEGORY_KEY, activeCategory);
  }, [activeCategory]);

  // --- Handlers ---
  const handleLogin = async (password: string): Promise<boolean> => {
      try {
        if (IS_EDGEONE_ENV) {
            const service = createEdgeOneService(password);
            const isValid = await service.verifyPassword(password);

            if (isValid) {
                setAuthToken(password);
                localStorage.setItem(AUTH_KEY, password);
                setIsAuthOpen(false);
                setSyncStatus('saved');

                // 加载数据
                const data = await service.loadAll();
                if (data.links && data.links.length > 0) {
                    // 云端有数据，使用云端数据
                    setLinks(data.links);
                    setCategories(data.categories || DEFAULT_CATEGORIES);
                    if (data.settings) setSiteSettings(prev => ({ ...prev, ...data.settings }));
                    if (data.searchEngines) setExternalEngines(data.searchEngines);
                    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
                } else {
                    // 云端没有数据，首次登录，使用当前数据（初始配置）并上传到云端
                    await service.saveAll({
                        links: links,
                        categories: categories,
                        settings: siteSettings,
                        searchEngines: externalEngines
                    });
                }

                return true;
            }
            return false;
        } else {
            const response = await fetch('/api/storage', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-auth-password': password
                },
                body: JSON.stringify({ links, categories, settings: siteSettings })
            });

            if (response.ok) {
                // 登录成功，尝试从云端获取最新数据
                const getDataRes = await fetch('/api/storage', {
                    method: 'GET',
                    headers: {
                        'x-auth-password': password
                    }
                });

                if (getDataRes.ok) {
                    const data = await getDataRes.json();
                    if (data.links && data.links.length > 0) {
                        // 云端有数据，使用云端数据
                        setLinks(data.links);
                        setCategories(data.categories || DEFAULT_CATEGORIES);
                        if (data.settings) setSiteSettings(prev => ({ ...prev, ...data.settings }));
                        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
                    }
                    // 云端没有数据，使用当前数据（初始配置）已在第一次请求中上传
                }

                setAuthToken(password);
                localStorage.setItem(AUTH_KEY, password);
                setIsAuthOpen(false);
                setSyncStatus('saved');
                return true;
            }
            return false;
        }
      } catch (e) {
          return false;
      }
  };

  const handleImportConfirm = (newLinks: LinkItem[], newCategories: Category[]) => {
      const mergedCategories = [...categories];
      newCategories.forEach(nc => {
          if (!mergedCategories.some(c => c.id === nc.id || c.name === nc.name)) {
              mergedCategories.push(nc);
          }
      });
      const mergedLinks = [...links, ...newLinks];
      updateData(mergedLinks, mergedCategories);
      setIsImportModalOpen(false);
      alert(`成功导入 ${newLinks.length} 个新书签!`);
  };

  const handleAddLink = (data: Omit<LinkItem, 'id' | 'createdAt'>) => {
    if (!authToken) { setIsAuthOpen(true); return; }
    const newLink: LinkItem = {
      ...data,
      id: Date.now().toString(),
      createdAt: Date.now()
    };
    updateData([newLink, ...links], categories);
    setPrefillLink(undefined);
  };

  const handleEditLink = (data: Omit<LinkItem, 'id' | 'createdAt'>) => {
    if (!authToken) { setIsAuthOpen(true); return; }
    if (!editingLink) return;
    const updated = links.map(l => l.id === editingLink.id ? { ...l, ...data } : l);
    updateData(updated, categories);
    setEditingLink(undefined);
  };

  const handleDeleteLink = (id: string) => {
    if (!authToken) { setIsAuthOpen(true); return; }
    const link = links.find(l => l.id === id);
    setDeleteConfirmData({ type: 'link', id, name: link?.title || '' });
  };

  const confirmDeleteLink = () => {
    if (!deleteConfirmData || deleteConfirmData.type !== 'link') return;
    updateData(links.filter(l => l.id !== deleteConfirmData.id), categories);
    setDeleteConfirmData(null);
  };

  const togglePin = (id: string) => {
      if (!authToken) { setIsAuthOpen(true); return; }
      const updated = links.map(l => l.id === id ? { ...l, pinned: !l.pinned } : l);
      updateData(updated, categories);
  };
  
  const handleCopyLink = (title: string, url: string) => {
      navigator.clipboard.writeText(url);
      setCopiedLinkTitle(title);
      setCopiedLinkUrl(url);
      setToastKey(Date.now());
      setShowCopySuccess(true);
      // 清除之前的 timeout
      if (toastTimeoutRef.current) {
          clearTimeout(toastTimeoutRef.current);
      }
      toastTimeoutRef.current = setTimeout(() => setShowCopySuccess(false), 2000);
  };

  const handleSaveAIConfig = (config: AIConfig, newSiteSettings: SiteSettings) => {
      setAiConfig(config);
      localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
      if (authToken) {
          updateData(links, categories, newSiteSettings);
      } else {
          setSiteSettings(newSiteSettings);
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ links, categories, settings: newSiteSettings }));
      }
  };

  const scrollToCategory = (catId: string) => {
      setActiveCategory(catId);
      setSidebarOpen(false);

      if (catId === 'all') {
          isAutoScrollingRef.current = true;
          contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
          setTimeout(() => isAutoScrollingRef.current = false, 800);
          return;
      }
      const el = document.getElementById(`cat-${catId}`);
      if (el) {
          isAutoScrollingRef.current = true;
          const top = el.offsetTop - 80;
          contentRef.current?.scrollTo({ top, behavior: 'smooth' });
          setTimeout(() => isAutoScrollingRef.current = false, 800);
      }
  };

  const handleUnlockCategory = (catId: string) => {
      setUnlockedCategoryIds(prev => new Set(prev).add(catId));
  };

  const handleUpdateCategories = (newCats: Category[], newLinks?: LinkItem[]) => {
      if (!authToken) { setIsAuthOpen(true); return; }
      updateData(newLinks || links, newCats);
  };

  const handleDeleteCategory = (catId: string) => {
      if (!authToken) { setIsAuthOpen(true); return; }
      const category = categories.find(c => c.id === catId);
      setDeleteConfirmData({ type: 'category', id: catId, name: category?.name || '' });
  };

  const confirmDeleteCategory = () => {
      if (!deleteConfirmData || deleteConfirmData.type !== 'category') return;
      const newCats = categories.filter(c => c.id !== deleteConfirmData.id);
      const newLinks = links.filter(l => l.categoryId !== deleteConfirmData.id);
      if (newCats.length === 0) newCats.push(DEFAULT_CATEGORIES[0]);
      updateData(newLinks, newCats);
      setDeleteConfirmData(null);
  };

  const handleReorderLinks = (newOrder: string[]) => {
      if (!authToken) { setIsAuthOpen(true); return; }
      const orderMap = new Map(newOrder.map((id, index) => [id, index]));
      const newLinks = [...links].sort((a, b) => {
          const orderA = orderMap.get(a.id) ?? Infinity;
          const orderB = orderMap.get(b.id) ?? Infinity;
          return orderA - orderB;
      });
      updateData(newLinks, categories);
  };

  const handleReorderCategories = (newCategories: Category[]) => {
      if (!authToken) { setIsAuthOpen(true); return; }
      updateData(links, newCategories);
  };

  const handleAddCategory = () => {
      if (!authToken) { setIsAuthOpen(true); return; }
      setEditingCategory(undefined);
      setIsCatEditModalOpen(true);
      setIsCategorySortModalOpen(false);
  };

  const handleEditCategory = (category: Category) => {
      if (!authToken) { setIsAuthOpen(true); return; }
      setEditingCategory(category);
      setIsCatEditModalOpen(true);
      setIsCategorySortModalOpen(false);
  };

  const handleSaveCategory = (categoryData: Omit<Category, 'id'>) => {
      if (editingCategory) {
          // 编辑现有分类
          const newCategories = categories.map(c =>
              c.id === editingCategory.id
                  ? { ...c, ...categoryData }
                  : c
          );
          updateData(links, newCategories);
      } else {
          // 添加新分类
          const newCategory: Category = {
              id: Date.now().toString(),
              ...categoryData
          };
          updateData(links, [...categories, newCategory]);
      }
      setEditingCategory(undefined);
      setIsCatEditModalOpen(false);
  };

  const handleSaveWebDavConfig = (config: WebDavConfig) => {
      setWebDavConfig(config);
      localStorage.setItem(WEBDAV_CONFIG_KEY, JSON.stringify(config));
  };

  const handleRestoreBackup = (restoredLinks: LinkItem[], restoredCategories: Category[]) => {
      updateData(restoredLinks, restoredCategories);
      setIsBackupModalOpen(false);
  };
  
  // Updated Search Logic
  const handleSearchSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!searchQuery.trim()) return;
      
      if (searchMode === 'external') {
          const engine = externalEngines.find(e => e.id === activeEngineId) || externalEngines[0];
          if (engine) {
              window.open(engine.url + encodeURIComponent(searchQuery), '_blank');
              setSearchQuery('');
          }
      }
  };

  const handleUpdateSearchEngines = (newEngines: SearchEngine[]) => {
      setExternalEngines(newEngines);
      localStorage.setItem(SEARCH_ENGINES_KEY, JSON.stringify(newEngines));
  };

  const isCategoryLocked = (catId: string) => {
      const cat = categories.find(c => c.id === catId);
      if (!cat || !cat.password) return false;
      return !unlockedCategoryIds.has(catId);
  };

  const pinnedLinks = useMemo(() => {
      return links.filter(l => l.pinned && !isCategoryLocked(l.categoryId));
  }, [links, categories, unlockedCategoryIds]);

  const searchResults = useMemo(() => {
    // Only filter locally if mode is 'local'
    if (searchMode !== 'local') return links;

    let result = links;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l => 
        l.title.toLowerCase().includes(q) || 
        l.url.toLowerCase().includes(q) ||
        (l.description && l.description.toLowerCase().includes(q))
      );
    }
    return result;
  }, [links, searchQuery, searchMode]);

  const activeExternalEngine = useMemo(() => {
      return externalEngines.find(e => e.id === activeEngineId) || externalEngines[0];
  }, [externalEngines, activeEngineId]);

  // --- Render Components ---

  const renderLinkCard = (link: LinkItem, isSortingMode = false) => {
      const iconDisplay = link.icon ? (
         <img
            src={link.icon}
            alt=""
            className="w-5 h-5 object-contain"
            onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement!.innerText = link.title.charAt(0);
            }}
         />
      ) : link.title.charAt(0);

      const isSimple = siteSettings.cardStyle === 'simple';

      const cardContent = (
            <a
                key={link.id}
                href={isSortingMode ? undefined : link.url}
                target={isSortingMode ? undefined : "_blank"}
                rel={isSortingMode ? undefined : "noopener noreferrer"}
                onContextMenu={(e) => {
                    if (isSortingMode) {
                        e.preventDefault();
                        return;
                    }
                    e.preventDefault();
                    e.stopPropagation();
                    let x = e.clientX;
                    let y = e.clientY;
                    // Boundary adjustment
                    if (x + 180 > window.innerWidth) x = window.innerWidth - 190;
                    if (y + 220 > window.innerHeight) y = window.innerHeight - 230;
                    setCategoryContextMenu(null);
                    setContextMenu({ x, y, link, categoryId: link.categoryId });
                    return false;
                }}
                className={`group relative flex flex-col ${isSimple ? 'p-2' : 'p-3'} bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700/50 shadow-sm hover:shadow-lg hover:border-blue-200 dark:hover:border-slate-600 hover:-translate-y-0.5 transition-all duration-200 hover:bg-blue-50 dark:hover:bg-slate-750 ${isSortingMode ? 'cursor-grab active:cursor-grabbing pointer-events-auto' : ''}`}
                title={link.description || link.url}
            >
                <div className={`flex items-center gap-3 ${isSimple ? '' : 'mb-1.5'} pr-6`}>
                    <div className={`${isSimple ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm'} rounded-lg bg-slate-50 dark:bg-slate-700 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold uppercase shrink-0 overflow-hidden`}>
                        {iconDisplay}
                    </div>
                    <h3 className="font-medium text-sm text-slate-800 dark:text-slate-200 truncate flex-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {link.title}
                    </h3>
                </div>
                {!isSimple && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 h-4 w-full overflow-hidden">
                        {link.description || <span className="opacity-0">.</span>}
                    </div>
                )}
            </a>
      );

      return cardContent;
  };

  return (
    <div className="flex h-screen text-slate-900 dark:text-slate-50 overflow-hidden">

      {/* Copy Success Toast */}
      {showCopySuccess && (
        <div
          key={toastKey}
          ref={toastRef}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[10000] bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-6 py-3 rounded-full shadow-lg flex items-center gap-2 animate-[slideDown_0.3s_ease-out]"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <CheckCircle2 size={20} />
          <span className="font-medium text-sm">{copiedLinkTitle} 链接已成功复制，粘贴到浏览器打开</span>
        </div>
      )}

      {/* Right Click Context Menu for Links */}
      {contextMenu && (
          <div
             ref={contextMenuRef}
             className="fixed z-[9999] bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-100 dark:border-slate-600 w-44 py-2 flex flex-col animate-in fade-in zoom-in duration-100 overflow-hidden"
             style={{ top: contextMenu.y, left: contextMenu.x }}
             onClick={(e) => e.stopPropagation()}
             onContextMenu={(e) => e.preventDefault()}
          >
             {/* 链接卡片上触发：显示复制、二维码、编辑、置顶、删除 */}
             {contextMenu.link && (
                 <>
                     <button onClick={() => { handleCopyLink(contextMenu.link!.title, contextMenu.link!.url); setContextMenu(null); }} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors text-left">
                         <Copy size={16} className="text-slate-400"/> <span>复制</span>
                     </button>
                     <button onClick={() => { setQrCodeLink(contextMenu.link); setContextMenu(null); }} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors text-left">
                         <QrCode size={16} className="text-slate-400"/> <span>二维码</span>
                     </button>

                     <div className="h-px bg-slate-100 dark:bg-slate-700 my-1 mx-2"/>

                     <button onClick={() => { if(!authToken) setIsAuthOpen(true); else { setEditingLink(contextMenu.link!); setIsModalOpen(true); setContextMenu(null); }}} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors text-left">
                         <Edit2 size={16} className="text-slate-400"/> <span>编辑</span>
                     </button>
                     <button onClick={() => { togglePin(contextMenu.link!.id); setContextMenu(null); }} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors text-left">
                         <Pin size={16} className={contextMenu.link!.pinned ? "fill-current text-blue-500" : "text-slate-400"}/> <span>{contextMenu.link!.pinned ? '取消置顶' : '置顶'}</span>
                     </button>

                     <div className="h-px bg-slate-100 dark:bg-slate-700 my-1 mx-2"/>

                     <button onClick={() => { handleDeleteLink(contextMenu.link!.id); setContextMenu(null); }} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors text-left">
                         <Trash2 size={16}/> <span>删除</span>
                     </button>
                 </>
             )}

             {/* 空白区域触发：只显示添加、排序 */}
             {!contextMenu.link && (
                 <>
                     <button onClick={() => { if(!authToken) setIsAuthOpen(true); else { setEditingLink(undefined); setPrefillLink({ categoryId: contextMenu.categoryId }); setIsModalOpen(true); setContextMenu(null); }}} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors text-left">
                         <Plus size={16} className="text-slate-400"/> <span>添加</span>
                     </button>
                     {contextMenu.categoryId && (
                         <button onClick={() => { setIsSorting({categoryId: contextMenu.categoryId!, type: 'links'}); setContextMenu(null); }} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors text-left">
                             <GripVertical size={16} className="text-slate-400"/> <span>排序</span>
                         </button>
                     )}
                 </>
             )}
          </div>
      )}

      {/* Category Context Menu */}
      {categoryContextMenu && (
          <CategoryContextMenu
              x={categoryContextMenu.x}
              y={categoryContextMenu.y}
              category={categoryContextMenu.category}
              onClose={() => setCategoryContextMenu(null)}
              onAddCategory={() => {
                  if(!authToken) {
                      setIsAuthOpen(true);
                  } else {
                      handleAddCategory();
                  }
              }}
              onEditCategory={() => {
                  if(!authToken) {
                      setIsAuthOpen(true);
                  } else {
                      handleEditCategory(categoryContextMenu.category!);
                  }
              }}
              onSortCategories={() => {
                  if(!authToken) {
                      setIsAuthOpen(true);
                  } else {
                      setIsSorting({categoryId: 'sidebar', type: 'categories'});
                  }
              }}
              onDeleteCategory={() => {
                  if(!authToken) {
                      setIsAuthOpen(true);
                  } else {
                      handleDeleteCategory(categoryContextMenu.category!.id);
                  }
              }}
          />
      )}

      {/* QR Code Modal */}
      {qrCodeLink && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setQrCodeLink(null)}>
              <div className="bg-white p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4 animate-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                  <h3 className="font-bold text-lg text-slate-800">{qrCodeLink.title}</h3>
                  <div className="p-2 border border-slate-200 rounded-lg">
                    <img 
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrCodeLink.url)}`} 
                        alt="QR Code" 
                        className="w-48 h-48"
                    />
                  </div>
                  <p className="text-xs text-slate-500 max-w-[200px] truncate">{qrCodeLink.url}</p>
              </div>
          </div>
      )}

      <AuthModal isOpen={isAuthOpen} onLogin={handleLogin} onClose={() => setIsAuthOpen(false)} />

      <CategoryAuthModal
        isOpen={!!catAuthModalData}
        category={catAuthModalData}
        onClose={() => setCatAuthModalData(null)}
        onUnlock={handleUnlockCategory}
      />

      <CategoryEditModal
        isOpen={isCatEditModalOpen}
        onClose={() => { setIsCatEditModalOpen(false); setEditingCategory(undefined); }}
        onSave={handleSaveCategory}
        editingCategory={editingCategory || null}
      />

      <CategoryManagerModal
        isOpen={isCatManagerOpen}
        onClose={() => setIsCatManagerOpen(false)}
        categories={categories}
        links={links}
        onUpdateCategories={handleUpdateCategories}
        onDeleteCategory={handleDeleteCategory}
        editingCategory={undefined}
      />

      {/* Category Sort Modal */}
      <CategorySortModal
          isOpen={isCategorySortModalOpen}
          categories={categories}
          onClose={() => setIsCategorySortModalOpen(false)}
          onOrderChange={handleReorderCategories}
          onAddCategory={handleAddCategory}
          onEditCategory={handleEditCategory}
          onDeleteCategory={handleDeleteCategory}
      />

      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        links={links}
        categories={categories}
        onRestore={handleRestoreBackup}
        webDavConfig={webDavConfig}
        onSaveWebDavConfig={handleSaveWebDavConfig}
      />

      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        existingLinks={links}
        categories={categories}
        onImport={handleImportConfirm}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        config={aiConfig}
        siteSettings={siteSettings}
        onSave={handleSaveAIConfig}
      />

      <SearchSettingsModal
        isOpen={isSearchSettingsOpen}
        onClose={() => setIsSearchSettingsOpen(false)}
        engines={externalEngines}
        activeEngineId={activeEngineId}
        onUpdateEngines={handleUpdateSearchEngines}
        onSelectEngine={setActiveEngineId}
      />

      {/* Sidebar Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-20 bg-black/50 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`
          fixed lg:static inset-y-0 left-0 z-30 w-64 transform transition-transform duration-300 ease-in-out
          bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="h-16 flex items-center px-6 border-b border-slate-100 dark:border-slate-700 shrink-0 gap-3">
             <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-blue-500/30 overflow-hidden">
                 {siteSettings.favicon ? (
                    <img src={siteSettings.favicon} alt="" className="w-full h-full object-cover" />
                 ) : (
                    "C"
                 )}
             </div>
            <span className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent truncate">
              {siteSettings.navTitle || 'HaoNav'}
            </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-hide">
            <button
              onClick={() => scrollToCategory('all')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                activeCategory === 'all' 
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium' 
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <div className="p-1"><Icon name="LayoutGrid" size={18} /></div>
              <span>全部链接</span>
            </button>
            
            <div className="flex items-end justify-between pt-8 pb-2 px-4 mb-4 h-9">
               <span className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 pb-0.5">分类目录</span>
               {isSorting?.categoryId === 'sidebar' && isSorting.type === 'categories' && (
                   <button
                       onClick={() => setIsSorting(null)}
                       className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-1.5 px-3 rounded-full text-xs transition-colors"
                   >
                       确认
                   </button>
               )}
            </div>

            {isSorting?.categoryId === 'sidebar' && isSorting.type === 'categories' ? (
                <SortableLinkList
                    items={categories.map(c => ({ id: c.id }))}
                    onOrderChange={(newOrder) => {
                        const newCategories = newOrder.map(id => categories.find(c => c.id === id)!).filter(Boolean);
                        handleReorderCategories(newCategories);
                    }}
                >
                    {(item) => {
                        const cat = categories.find(c => c.id === item.id);
                        if (!cat) return null;
                        const isLocked = cat.password && !unlockedCategoryIds.has(cat.id);
                        const isEmoji = cat.icon && cat.icon.length <= 4 && !/^[a-zA-Z]+$/.test(cat.icon);

                        return (
                            <div
                                key={cat.id}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    let x = e.clientX;
                                    let y = e.clientY;
                                    if (x + 180 > window.innerWidth) x = window.innerWidth - 190;
                                    if (y + 250 > window.innerHeight) y = window.innerHeight - 260;
                                    setContextMenu(null);
                                    setCategoryContextMenu({ x, y, category: cat });
                                }}
                                className="cursor-grab active:cursor-grabbing"
                            >
                                <div
                                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all group ${
                                        activeCategory === cat.id
                                            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-medium'
                                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                                    }`}
                                >
                                    <div className={`p-1.5 rounded-lg transition-colors flex items-center justify-center ${activeCategory === cat.id ? 'bg-blue-100 dark:bg-blue-800' : 'bg-slate-100 dark:bg-slate-800'}`}>
                                        {isLocked ? <Lock size={16} className="text-amber-500" /> : (isEmoji ? <span className="text-base leading-none">{cat.icon}</span> : <Icon name={cat.icon} size={16} />)}
                                    </div>
                                    <span className="truncate flex-1 text-left">{cat.name}</span>
                                </div>
                            </div>
                        );
                    }}
                </SortableLinkList>
            ) : (
                categories.map(cat => {
                    const isLocked = cat.password && !unlockedCategoryIds.has(cat.id);
                    const isEmoji = cat.icon && cat.icon.length <= 4 && !/^[a-zA-Z]+$/.test(cat.icon);

                    return (
                        <div
                            key={cat.id}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                let x = e.clientX;
                                let y = e.clientY;
                                if (x + 180 > window.innerWidth) x = window.innerWidth - 190;
                                if (y + 250 > window.innerHeight) y = window.innerHeight - 260;
                                setContextMenu(null);
                                setCategoryContextMenu({ x, y, category: cat });
                            }}
                        >
                            <button
                                onClick={() => scrollToCategory(cat.id)}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all group ${
                                    activeCategory === cat.id
                                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium'
                                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                                }`}
                            >
                                <div className={`p-1.5 rounded-lg transition-colors flex items-center justify-center ${activeCategory === cat.id ? 'bg-blue-100 dark:bg-blue-800' : 'bg-slate-100 dark:bg-slate-800'}`}>
                                    {isLocked ? <Lock size={16} className="text-amber-500" /> : (isEmoji ? <span className="text-base leading-none">{cat.icon}</span> : <Icon name={cat.icon} size={16} />)}
                                </div>
                                <span className="truncate flex-1 text-left">{cat.name}</span>
                                {activeCategory === cat.id && <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>}
                            </button>
                        </div>
                    );
                })
            )}
        </div>

        <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
            <div className="grid grid-cols-3 gap-2 mb-2">
                <button 
                    onClick={() => { if(!authToken) setIsAuthOpen(true); else setIsImportModalOpen(true); }}
                    className="flex flex-col items-center justify-center gap-1 p-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 transition-all"
                    title="导入书签"
                >
                    <Upload size={14} />
                    <span>导入</span>
                </button>
                <button 
                    onClick={() => { if(!authToken) setIsAuthOpen(true); else setIsBackupModalOpen(true); }}
                    className="flex flex-col items-center justify-center gap-1 p-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 transition-all"
                    title="备份与恢复"
                >
                    <CloudCog size={14} />
                    <span>备份</span>
                </button>
                <button 
                    onClick={() => setIsSettingsModalOpen(true)}
                    className="flex flex-col items-center justify-center gap-1 p-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 transition-all"
                    title="AI 设置"
                >
                    <Settings size={14} />
                    <span>设置</span>
                </button>
            </div>
            
            <div className="flex items-center justify-between text-xs px-2 mt-2">
               <div className="flex items-center gap-1 text-slate-400">
                 {syncStatus === 'saving' && <Loader2 className="animate-spin w-3 h-3 text-blue-500" />}
                 {syncStatus === 'saved' && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                 {syncStatus === 'error' && <AlertCircle className="w-3 h-3 text-red-500" />}
                 {authToken ? <span className="text-green-600">已同步</span> : <span className="text-amber-500">离线</span>}
               </div>
               <a 
                 href={GITHUB_REPO_URL} 
                 target="_blank" 
                 rel="noopener noreferrer"
                 className="flex items-center gap-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                 title="Fork this project on GitHub"
               >
                 <GitFork size={14} />
                 <span>Fork 项目</span>
               </a>
            </div>
        </div>
      </aside>

      <main
          ref={mainRef}
          className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-900 relative"
      >
        <header className="h-16 px-4 lg:px-8 flex items-center justify-between bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-700 shrink-0 relative z-40">
          <div className="flex items-center gap-4 flex-1">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 -ml-2 text-slate-600 dark:text-slate-300">
              <Menu size={24} />
            </button>

            {/* Redesigned Search Bar */}
            <div className="relative w-full max-w-xl hidden sm:flex items-center gap-3">
                {/* Search Mode Toggle (Pill) */}
                <div className="bg-slate-100 dark:bg-slate-700 p-1 rounded-full flex items-center shrink-0">
                    <button
                        onClick={() => setSearchMode('local')}
                        className={`px-3 py-1.5 text-sm font-medium rounded-full transition-all ${
                            searchMode === 'local'
                            ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                    >
                        站内
                    </button>
                    <button
                        onClick={() => setSearchMode('external')}
                        className={`px-3 py-1.5 text-sm font-medium rounded-full transition-all ${
                            searchMode === 'external'
                            ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                    >
                        站外
                    </button>
                </div>

                {/* Search Input */}
                <form onSubmit={handleSearchSubmit} className="flex-1 relative flex items-center group z-50">
                    <input
                        ref={searchInputRef}
                        type="text"
                        placeholder={searchMode === 'local' ? "搜索书签..." : `在 ${activeExternalEngine?.name} 搜索...`}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-700/50 hover:bg-white dark:hover:bg-slate-700 border border-transparent hover:border-slate-200 dark:hover:border-slate-600 rounded-full text-sm dark:text-white placeholder-slate-400 outline-none transition-all focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-blue-500/50"
                    />
                    <div className={`absolute left-3 text-slate-400 flex items-center gap-2 ${searchMode === 'external' ? 'cursor-pointer hover:text-blue-500' : 'pointer-events-none'}`}>
                        {searchMode === 'local' ? (
                            <Search size={16} />
                        ) : (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowEngineSelector(!showEngineSelector);
                                }}
                                className="flex items-center"
                            >
                                {activeExternalEngine?.icon?.startsWith('http') ? (
                                    <img src={activeExternalEngine.icon} className="w-4 h-4 rounded-full object-cover" />
                                ) : (
                                    <Search size={16} />
                                )}
                            </button>
                        )}
                    </div>

                    {/* Engine Selector Dropdown */}
                    {showEngineSelector && searchMode === 'external' && (
                        <div
                            ref={engineSelectorRef}
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="absolute left-0 top-full mt-2 z-[99999] bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-600 w-56 overflow-hidden animate-in fade-in zoom-in duration-200"
                        >
                            <div className="py-2 max-h-64 overflow-y-auto">
                                {externalEngines.map((engine) => (
                                    <button
                                        key={engine.id}
                                        type="button"
                                        onClick={() => {
                                            setActiveEngineId(engine.id);
                                            setShowEngineSelector(false);
                                        }}
                                        className={`w-full flex items-center gap-3 px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${
                                            activeEngineId === engine.id
                                                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                                : 'text-slate-700 dark:text-slate-300'
                                        }`}
                                    >
                                        {engine.icon?.startsWith('http') ? (
                                            <img src={engine.icon} className="w-5 h-5 rounded-full object-cover" />
                                        ) : (
                                            <Search size={20} />
                                        )}
                                        <span className="flex-1 text-left text-sm">{engine.name}</span>
                                        {activeEngineId === engine.id && (
                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Visual Indicator for Search */}
                    {searchQuery && (
                        <button type="submit" className="absolute right-2 p-1.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 rounded-full hover:bg-blue-200 transition-colors">
                            <ArrowRight size={14} />
                        </button>
                    )}
                </form>

                {/* Settings Gear (Visible only for External) */}
                {searchMode === 'external' && (
                    <button
                        onClick={() => setIsSearchSettingsOpen(true)}
                        className="p-2 text-slate-400 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors animate-in fade-in slide-in-from-left-2 duration-200"
                        title="管理搜索引擎"
                    >
                        <Settings size={18} />
                    </button>
                )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden md:flex bg-slate-100 dark:bg-slate-700 rounded-lg p-1 mr-2">
                <button 
                    onClick={() => authToken && updateData(links, categories, { ...siteSettings, cardStyle: 'simple' })}
                    title="简约模式"
                    className={`p-1.5 rounded transition-all ${siteSettings.cardStyle === 'simple' ? 'bg-white dark:bg-slate-600 shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    <LayoutGrid size={16} />
                </button>
                <button 
                    onClick={() => authToken && updateData(links, categories, { ...siteSettings, cardStyle: 'detailed' })}
                    title="详情模式"
                    className={`p-1.5 rounded transition-all ${siteSettings.cardStyle === 'detailed' ? 'bg-white dark:bg-slate-600 shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    <List size={16} />
                </button>
            </div>

            <button onClick={toggleTheme} className="p-2 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {authToken ? (
                <button 
                    onClick={() => {
                        setAuthToken(null);
                        localStorage.removeItem(AUTH_KEY);
                    }}
                    className="hidden sm:flex items-center gap-2 bg-slate-200 dark:bg-slate-700 px-3 py-1.5 rounded-full text-xs font-medium hover:bg-slate-300 dark:hover:bg-slate-600"
                >
                    <LogOut size={14} /> 退出
                </button>
            ) : (
                <button onClick={() => setIsAuthOpen(true)} className="hidden sm:flex items-center gap-2 bg-slate-200 dark:bg-slate-700 px-3 py-1.5 rounded-full text-xs font-medium">
                    <Cloud size={14} /> 登录
                </button>
            )}
          </div>
        </header>

        <div
            ref={contentRef}
            className="flex-1 overflow-y-auto p-4 lg:p-8 space-y-8 min-h-0"
            onClick={(e) => {
                // Exit sorting mode when clicking on blank area
                if (isSorting && !(e.target as HTMLElement).closest('button, a, .sortable-item')) {
                    setIsSorting(null);
                }
            }}
            onContextMenu={(e) => {
                // 只在真正的空白区域触发右键菜单
                const target = e.target as HTMLElement;
                if (target.closest('a, button, .sortable-item')) return;
                e.preventDefault();
                e.stopPropagation();
                let x = e.clientX;
                let y = e.clientY;
                if (x + 180 > window.innerWidth) x = window.innerWidth - 190;
                if (y + 200 > window.innerHeight) y = window.innerHeight - 210;

                // 尝试找到鼠标所在的分类section
                const section = target.closest('section[id^="cat-"]');
                let targetCatId = activeCategory === 'all' ? null : activeCategory;

                // 如果找到了section，提取其ID中的分类ID
                if (section && section.id) {
                    const match = section.id.match(/^cat-(.+)$/);
                    if (match && match[1]) {
                        targetCatId = match[1];
                    }
                }

                const targetCat = targetCatId ? categories.find(c => c.id === targetCatId) : null;
                setCategoryContextMenu(null);
                // 打开添加/排序菜单（没有link对象，只有categoryId）
                setContextMenu({ x, y, link: null, categoryId: targetCatId });
            }}
        >
            
            {/* Category Page View - Show only pinned links and current category links */}
            {activeCategory !== 'all' && (
                <>
                    {pinnedLinks.length > 0 && !searchQuery && (
                        <section>
                            <div className="flex items-center gap-2 mb-4">
                                <Pin size={16} className="text-blue-500 fill-blue-500" />
                                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    置顶 / 常用
                                </h2>
                            </div>
                            <div className={`grid gap-3 ${siteSettings.cardStyle === 'simple' ? 'grid-cols-2 md:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10' : 'grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8'}`}>
                                {pinnedLinks.map(link => renderLinkCard(link))}
                            </div>
                        </section>
                    )}

                    {(() => {
                        const currentCat = categories.find(cat => cat.id === activeCategory);
                        if (!currentCat) return null;
                        
                        let catLinks = searchResults.filter(l => l.categoryId === activeCategory);
                        const isLocked = currentCat.password && !unlockedCategoryIds.has(currentCat.id);
                        
                        if (searchQuery && searchMode === 'local' && catLinks.length === 0) return null;

                        return (
                            <section key={currentCat.id} id={`cat-${currentCat.id}`} className="scroll-mt-24">
                                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                                    <div className="flex items-center gap-2">
                                        <div className="text-slate-400">
                                            {currentCat.icon && currentCat.icon.length <= 4 && !/^[a-zA-Z]+$/.test(currentCat.icon) ? <span className="text-lg">{currentCat.icon}</span> : <Icon name={currentCat.icon} size={20} />}
                                        </div>
                                        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">
                                            {currentCat.name}
                                        </h2>
                                        {isLocked && <Lock size={16} className="text-amber-500" />}
                                    </div>



                                    {/* Sort Button - Only show when logged in and not in search mode */}
                                    {isSorting?.categoryId === currentCat.id && isSorting.type === 'links' && (
                                        <button
                                            onClick={() => setIsSorting(null)}
                                            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-1.5 px-3 rounded-full text-xs transition-colors"
                                        >
                                            确认
                                        </button>
                                    )}
                                </div>
                                
                                {isLocked ? (
                                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-8 flex flex-col items-center justify-center text-center">
                                        <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-4 text-amber-600 dark:text-amber-400">
                                            <Lock size={24} />
                                        </div>
                                        <h3 className="text-slate-800 dark:text-slate-200 font-medium mb-1">私密目录</h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">该分类已加密，需要验证密码才能查看内容</p>
                                        <button 
                                            onClick={() => setCatAuthModalData(currentCat)}
                                            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
                                        >
                                            输入密码解锁
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        {catLinks.length === 0 ? (
                                            <div className="text-center py-8 text-slate-400 text-sm italic">
                                                暂无链接
                                            </div>
                                        ) : (
                                            <div className={`grid gap-3 ${siteSettings.cardStyle === 'simple' ? 'grid-cols-2 md:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10' : 'grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8'}`}>
                                                {isSorting?.categoryId === currentCat.id && isSorting.type === 'links' ? (
                                                    <SortableLinkList
                                                        items={catLinks.map(l => ({ id: l.id }))}
                                                        onOrderChange={handleReorderLinks}
                                                    >
                                                        {(item) => {
                                                            const link = catLinks.find(l => l.id === item.id);
                                                            if (!link) return null;
                                                            return renderLinkCard(link, true);
                                                        }}
                                                    </SortableLinkList>
                                                ) : (
                                                    catLinks.map(link => renderLinkCard(link, false))
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}
                            </section>
                        );
                    })()}
                </>
            )}
            
            {/* All Categories View - Show all categories (default) */}
            {activeCategory === 'all' && (
                <>
                    {pinnedLinks.length > 0 && !searchQuery && (
                        <section>
                            <div className="flex items-center gap-2 mb-4">
                                <Pin size={16} className="text-blue-500 fill-blue-500" />
                                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    置顶 / 常用
                                </h2>
                            </div>
                            <div className={`grid gap-3 ${siteSettings.cardStyle === 'simple' ? 'grid-cols-2 md:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10' : 'grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8'}`}>
                                {pinnedLinks.map(link => renderLinkCard(link))}
                            </div>
                        </section>
                    )}

                    {categories.map(cat => {
                        let catLinks = searchResults.filter(l => l.categoryId === cat.id);
                        const isLocked = cat.password && !unlockedCategoryIds.has(cat.id);
                        
                        if (searchQuery && searchMode === 'local' && catLinks.length === 0) return null;

                        return (
                            <section key={cat.id} id={`cat-${cat.id}`} className="scroll-mt-24">
                                <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
                                    <div className="flex items-center gap-2">
                                        <div className="text-slate-400">
                                            {cat.icon && cat.icon.length <= 4 && !/^[a-zA-Z]+$/.test(cat.icon) ? <span className="text-lg">{cat.icon}</span> : <Icon name={cat.icon} size={20} />}
                                        </div>
                                        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">
                                            {cat.name}
                                        </h2>
                                        {isLocked && <Lock size={16} className="text-amber-500" />}
                                    </div>

                                    {/* Sort Button - Show when sorting this category */}
                                    {isSorting?.categoryId === cat.id && isSorting.type === 'links' && (
                                        <button
                                            onClick={() => setIsSorting(null)}
                                            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-1.5 px-3 rounded-full text-xs transition-colors"
                                        >
                                            确认
                                        </button>
                                    )}
                                </div>
                                
                                {isLocked ? (
                                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-8 flex flex-col items-center justify-center text-center">
                                        <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-4 text-amber-600 dark:text-amber-400">
                                            <Lock size={24} />
                                        </div>
                                        <h3 className="text-slate-800 dark:text-slate-200 font-medium mb-1">私密目录</h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">该分类已加密，需要验证密码才能查看内容</p>
                                        <button 
                                            onClick={() => setCatAuthModalData(cat)}
                                            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
                                        >
                                            输入密码解锁
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        {catLinks.length === 0 ? (
                                            <div className="text-center py-8 text-slate-400 text-sm italic">
                                                暂无链接
                                            </div>
                                        ) : (
                                            <div className={`grid gap-3 ${siteSettings.cardStyle === 'simple' ? 'grid-cols-2 md:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10' : 'grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8'}`}>
                                                {isSorting?.categoryId === cat.id && isSorting.type === 'links' ? (
                                                    <SortableLinkList
                                                        items={catLinks.map(l => ({ id: l.id }))}
                                                        onOrderChange={handleReorderLinks}
                                                    >
                                                        {(item) => {
                                                            const link = catLinks.find(l => l.id === item.id);
                                                            if (!link) return null;
                                                            return renderLinkCard(link, true);
                                                        }}
                                                    </SortableLinkList>
                                                ) : (
                                                    catLinks.map(link => renderLinkCard(link, false))
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}
                            </section>
                        );
                    })}
                </>
            )}
            
            {/* Empty State for Local Search */}
            {searchQuery && searchMode === 'local' && searchResults.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                    <Search size={40} className="opacity-30 mb-4" />
                    <p>没有找到相关内容</p>
                    <button onClick={() => setIsModalOpen(true)} className="mt-4 text-blue-500 hover:underline">添加一个?</button>
                </div>
            )}

            <div className="h-20"></div>
        </div>
      </main>

      <LinkModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingLink(undefined); setPrefillLink(undefined); }}
        onSave={editingLink ? handleEditLink : handleAddLink}
        categories={categories}
        existingLinks={links}
        initialData={editingLink}
        prefillData={prefillLink}
        aiConfig={aiConfig}
      />

      <DeleteConfirmModal
        isOpen={!!deleteConfirmData}
        onClose={() => setDeleteConfirmData(null)}
        onConfirm={deleteConfirmData?.type === 'link' ? confirmDeleteLink : confirmDeleteCategory}
        type={deleteConfirmData?.type || 'link'}
        itemName={deleteConfirmData?.name}
      />
    </div>
  );
}

export default App;
