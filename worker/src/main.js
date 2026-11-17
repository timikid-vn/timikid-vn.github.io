// Điểm vào khi deploy (wrangler main). Giữ NGUYÊN mọi route/cron cũ của index.js (export default),
// chỉ THÊM entrypoint RPC "ShopRead" (chỉ Worker/Pages có service binding tới entrypoint này mới gọi được, không lộ ra Internet).
import { WorkerEntrypoint } from 'cloudflare:workers';
import worker, { ShopTokens } from './index.js';
import { shopeeStatus, shopeeRead } from './shopread.js';
export { ShopTokens };

export class ShopRead extends WorkerEntrypoint {
  async shopeeStatus(shopId) { return shopeeStatus(this.env, shopId); }
  async shopeeRead(shopId, path, params) { return shopeeRead(this.env, shopId, path, params); }
}
export default worker;
