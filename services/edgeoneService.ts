/**
 * EdgeOne KV 存储服务
 * 封装前端与 EdgeOne KV 的交互
 */

import { LinkItem, Category, SiteSettings, SearchEngine } from '../types';

export interface StorageData {
  links: LinkItem[];
  categories: Category[];
  settings: SiteSettings;
  searchEngines?: SearchEngine[];
}

const API_BASE = '/api/storage';

export class EdgeOneKVService {
  private authToken: string;

  constructor(authToken: string) {
    this.authToken = authToken;
  }

  /**
   * 从 KV 读取所有数据
   */
  async loadAll(): Promise<StorageData> {
    const response = await fetch(API_BASE, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-password': this.authToken
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to load data: ${response.status}`);
    }

    const data = await response.json();
    return {
      links: data.links || [],
      categories: data.categories || [],
      settings: data.settings || { title: '', navTitle: '', favicon: '', cardStyle: 'detailed' },
      searchEngines: data.searchEngines
    };
  }

  /**
   * 保存所有数据到 KV
   */
  async saveAll(data: StorageData): Promise<boolean> {
    const response = await fetch(API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-password': this.authToken
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`Failed to save data: ${response.status}`);
    }

    const result = await response.json();
    return result.success === true;
  }

  /**
   * 仅保存链接数据
   */
  async saveLinks(links: LinkItem[]): Promise<boolean> {
    const data = await this.loadAll();
    data.links = links;
    return this.saveAll(data);
  }

  /**
   * 仅保存分类数据
   */
  async saveCategories(categories: Category[]): Promise<boolean> {
    const data = await this.loadAll();
    data.categories = categories;
    return this.saveAll(data);
  }

  /**
   * 仅保存设置
   */
  async saveSettings(settings: SiteSettings): Promise<boolean> {
    const data = await this.loadAll();
    data.settings = settings;
    return this.saveAll(data);
  }

  /**
   * 仅保存搜索引擎
   */
  async saveSearchEngines(engines: SearchEngine[]): Promise<boolean> {
    const data = await this.loadAll();
    data.searchEngines = engines;
    return this.saveAll(data);
  }

  /**
   * 验证密码
   */
  async verifyPassword(password: string): Promise<boolean> {
    try {
      const response = await fetch(API_BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-password': password
        },
        body: JSON.stringify({ links: [], categories: [], settings: {} })
      });

      if (response.status === 401) {
        return false;
      }

      const result = await response.json();
      return result.success === true;
    } catch (error) {
      console.error('Password verification failed:', error);
      return false;
    }
  }
}

/**
 * 创建 EdgeOne KV 服务实例
 */
export function createEdgeOneService(authToken: string): EdgeOneKVService {
  return new EdgeOneKVService(authToken);
}
