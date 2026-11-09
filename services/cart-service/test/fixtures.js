import { NotFound } from '@del-campo/shared';

/** Test double of catalog-service: listings as the Harvest message carries them. */
export class FakeCatalogClient {
  constructor() {
    this.harvests = new Map([
      ['cos-2', { id: 'cos-2', product: 'Arveja', unit: 'kg', unitPrice: 4200, freeQuantity: 300, acceptsReservations: true }],
      ['cos-3', { id: 'cos-3', product: 'Lechuga', unit: 'unidad', unitPrice: 1300, freeQuantity: 500, acceptsReservations: true, photo: '/uploads/l.webp' }],
      ['cos-9', { id: 'cos-9', product: 'Mora', unit: 'kg', unitPrice: 5200, freeQuantity: 0, acceptsReservations: false }],
    ]);
  }

  async getHarvestsByIds(ids) {
    return ids.map((id) => this.harvests.get(id)).filter(Boolean);
  }

  async getHarvest(id) {
    const harvest = this.harvests.get(id);
    if (!harvest) throw new NotFound('Cosecha');
    return harvest;
  }
}
