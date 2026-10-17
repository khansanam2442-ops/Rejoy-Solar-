/**
 * SolarPulse EPC ERP & CRM - MySQL Backend API Client
 * Provides unified async communication with /api/* endpoints
 */

export interface DbStatusResponse {
  success: boolean;
  connected: boolean;
  host: string;
  database: string;
  port: number;
  mode: string;
  dumpAvailable: boolean;
  dumpPath: string;
  message: string;
  tables?: string[];
}

class ApiClient {
  private baseUrl: string = '/api';

  // --- Database Management & Migration ---

  async getDbStatus(): Promise<DbStatusResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/db/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e: any) {
      return {
        success: false,
        connected: false,
        host: 'localhost',
        database: 'solarpulse_erp',
        port: 3306,
        mode: 'STANDBY_PERSISTENCE_MODE',
        dumpAvailable: true,
        dumpPath: '/database.sql',
        message: 'Could not contact backend API: ' + e.message
      };
    }
  }

  async testDbConnection(config: { host: string; port?: number; user: string; password?: string; database: string }): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/db/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, message: e.message || 'Connection test failed.' };
    }
  }

  async runMigration(config?: any): Promise<{ success: boolean; message: string; tablesCount?: number }> {
    try {
      const res = await fetch(`${this.baseUrl}/db/migrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config || {})
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, message: e.message || 'Migration request failed.' };
    }
  }

  getSqlDumpDownloadUrl(): string {
    return `${this.baseUrl}/db/dump.sql`;
  }

  // --- Master Bootstrap Data ---
  async getBootstrapData(): Promise<Record<string, any> | null> {
    try {
      const res = await fetch(`${this.baseUrl}/bootstrap`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.data || null;
    } catch {
      return null;
    }
  }

  async syncPush(collection: string, payload: { item?: any; items?: any[]; action?: string }): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/sync/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection, ...payload })
      });
      return await res.json();
    } catch {
      return null;
    }
  }

  // --- Auth & Customer Portal ---

  async login(email: string, pass: string): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass })
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  }

  async updateCustomerPassword(customerId: string, newPassword: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/customers/${encodeURIComponent(customerId)}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword })
      });
      const data = await res.json();
      return Boolean(data.success);
    } catch {
      return false;
    }
  }

  // --- Customers ---
  async getCustomers(): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/customers`);
      const data = await res.json();
      return data.data || [];
    } catch {
      return [];
    }
  }

  async saveCustomer(cust: any): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cust)
      });
      const data = await res.json();
      return data.data || cust;
    } catch {
      return cust;
    }
  }

  async deleteCustomer(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/customers/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // --- Leads ---
  async getLeads(): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/leads`);
      const data = await res.json();
      return data.data || [];
    } catch {
      return [];
    }
  }

  async saveLead(lead: any): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lead)
      });
      const data = await res.json();
      return data.data || lead;
    } catch {
      return lead;
    }
  }

  async deleteLead(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/leads/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // --- Projects ---
  async getProjects(): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/projects`);
      const data = await res.json();
      return data.data || [];
    } catch {
      return [];
    }
  }

  async saveProject(proj: any): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proj)
      });
      const data = await res.json();
      return data.data || proj;
    } catch {
      return proj;
    }
  }

  async deleteProject(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/projects/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // --- Employees ---
  async getEmployees(): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/employees`);
      const data = await res.json();
      return data.data || [];
    } catch {
      return [];
    }
  }

  async saveEmployee(emp: any): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emp)
      });
      const data = await res.json();
      return data.data || emp;
    } catch {
      return emp;
    }
  }

  async deleteEmployee(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/employees/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

export const apiClient = new ApiClient();
