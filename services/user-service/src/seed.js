/**
 * Demo accounts (rural area of Boyacá / Cundinamarca). They are created only the first time
 * (when the app_user table is empty). Every demo account uses the same password.
 */
export const DEMO_PASSWORD = 'campo123';

export const demoUsers = [
  { id: 'p-rosa', email: 'rosa@delcampo.co', role: 'PRODUCER', name: 'Rosa Pérez', phone: '3001234567', farm: 'La Esperanza', village: 'El Rosal', town: 'Ventaquemada', location: { lat: 5.3667, lng: -73.5214 }, crops: ['papa criolla', 'arveja'] },
  { id: 'p-jose', email: 'jose@delcampo.co', role: 'PRODUCER', name: 'José Rincón', phone: '3109876543', farm: 'El Mirador', village: 'Puente de Piedra', town: 'Madrid', location: { lat: 4.7639, lng: -74.2794 }, crops: ['lechuga', 'cebolla larga'] },
  { id: 'p-carmen', email: 'carmen@delcampo.co', role: 'PRODUCER', name: 'Carmen Suárez', phone: '3205551122', farm: 'Los Naranjos', village: 'Chinauta', town: 'Fusagasugá', location: { lat: 4.2731, lng: -74.4174 }, crops: ['mora', 'tomate de árbol'] },
  { id: 'p-luis', email: 'luis@delcampo.co', role: 'PRODUCER', name: 'Luis Gómez', phone: '3157778899', farm: 'San Isidro', village: 'Fagua', town: 'Chía', location: { lat: 4.8961, lng: -74.0378 }, crops: ['fresa', 'zanahoria'] },
  { id: 'c-ana', email: 'ana@delcampo.co', role: 'BUYER', type: 'CONSUMER', name: 'Ana Torres', location: { lat: 4.6486, lng: -74.0628 } },
  { id: 'c-tienda', email: 'tienda@delcampo.co', role: 'BUYER', type: 'STORE', name: 'Tienda Don Pedro', location: { lat: 4.7110, lng: -74.0721 } },
  { id: 'c-resto', email: 'restaurante@delcampo.co', role: 'BUYER', type: 'RESTAURANT', name: 'Restaurante La Huerta', location: { lat: 4.6097, lng: -74.0817 } },
];
