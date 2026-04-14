import axios from 'axios';

export interface RajaOngkirCity {
  city_id: string;
  province_id: string;
  province: string;
  type: string;
  city_name: string;
  postal_code: string;
}

export interface RajaOngkirCost {
  service: string;
  description: string;
  cost: {
    value: number;
    etd: string;
    note: string;
  }[];
}

export class RajaOngkirService {
  private baseURL: string;
  private apiKey: string;

  constructor(apiKey: string, type: 'starter' | 'basic' | 'pro' = 'starter') {
    this.apiKey = apiKey;
    this.baseURL = type === 'starter' 
      ? 'https://api.rajaongkir.com/starter' 
      : type === 'basic' 
        ? 'https://api.rajaongkir.com/basic' 
        : 'https://pro.rajaongkir.com/api';
  }

  async getCities(): Promise<RajaOngkirCity[]> {
    try {
      const resp = await axios.get(`${this.baseURL}/city`, {
        headers: { key: this.apiKey }
      });
      return resp.data.rajaongkir.results;
    } catch (err: any) {
      console.error('[RajaOngkir] getCities error:', err.response?.data || err.message);
      throw new Error(err.response?.data?.rajaongkir?.status?.description || 'Gagal mengambil data kota');
    }
  }

  async calculateCost(origin: string, destination: string, weight: number, courier: string): Promise<RajaOngkirCost[]> {
    try {
      const resp = await axios.post(`${this.baseURL}/cost`, {
        origin,
        destination,
        weight,
        courier
      }, {
        headers: { key: this.apiKey }
      });
      return resp.data.rajaongkir.results[0].costs;
    } catch (err: any) {
      console.error('[RajaOngkir] calculateCost error:', err.response?.data || err.message);
      throw new Error(err.response?.data?.rajaongkir?.status?.description || 'Gagal menghitung ongkir');
    }
  }
}
