import { Coordenada } from '../dominio/Coordenada.js';
import { EstadoCosecha } from '../dominio/Cosecha.js';

/** Consultas de lectura: catálogo por temporada, cercanía y perfil del productor. */
export class CatalogoService {
  constructor({ repoCosechas, repoUsuarios, calculadoraPrecio, reputacionService }) {
    this.repoCosechas = repoCosechas;
    this.repoUsuarios = repoUsuarios;
    this.calculadoraPrecio = calculadoraPrecio;
    this.reputacionService = reputacionService;
  }

  /**
   * @param {object} filtro
   * @param {number} [filtro.lat] @param {number} [filtro.lng] ubicación del comprador
   * @param {number} [filtro.radioKm]
   * @param {string} [filtro.categoria] @param {string} [filtro.estado]
   * @param {number} [filtro.diasMax] solo cosechas disponibles dentro de N días
   */
  async catalogo({ lat, lng, radioKm, categoria, estado, diasMax } = {}) {
    const origen = lat != null && lng != null ? new Coordenada(lat, lng) : null;
    const limiteFecha = diasMax != null ? new Date(Date.now() + Number(diasMax) * 86_400_000) : null;

    const cosechas = await this.repoCosechas.listar((c) =>
      c.estado !== EstadoCosecha.AGOTADO &&
      (!categoria || c.categoria === categoria) &&
      (!estado || c.estado === estado) &&
      (!limiteFecha || new Date(c.fechaDisponible) <= limiteFecha));

    const productores = new Map((await this.repoUsuarios.listar((u) => u.rol === 'PRODUCTOR')).map((p) => [p.id, p]));

    const items = cosechas.map((c) => {
      const p = productores.get(c.productorId);
      return {
        ...c.toJSON(),
        productor: p && { id: p.id, nombre: p.nombre, finca: p.finca, vereda: p.vereda, municipio: p.municipio, ubicacion: p.ubicacion },
        distanciaKm: origen && p ? Number(p.ubicacion.distanciaKm(origen).toFixed(1)) : null,
        precio: {
          evaluacion: this.calculadoraPrecio.evaluar(c.producto, c.precioUnitario),
          referencia: this.calculadoraPrecio.referencia(c.producto),
        },
      };
    });

    const filtrados = origen && radioKm ? items.filter((i) => i.distanciaKm <= Number(radioKm)) : items;
    return filtrados.sort((a, b) =>
      origen ? a.distanciaKm - b.distanciaKm : a.fechaDisponible.localeCompare(b.fechaDisponible));
  }

  /** Calendario de cosechas agrupado por mes de disponibilidad (usado por la página SSG). */
  async temporada() {
    const items = await this.catalogo();
    const meses = new Map();
    for (const item of items.sort((a, b) => a.fechaDisponible.localeCompare(b.fechaDisponible))) {
      const mes = item.fechaDisponible.slice(0, 7);
      if (!meses.has(mes)) meses.set(mes, []);
      meses.get(mes).push(item);
    }
    return [...meses].map(([mes, cosechas]) => ({ mes, cosechas }));
  }

  async productoresCercanos({ lat, lng, radioKm = 50 }) {
    const resultado = await this.repoUsuarios.productoresCercanos(new Coordenada(lat, lng), Number(radioKm));
    return resultado.map(({ productor, distanciaKm }) => ({ ...productor.toJSON(), distanciaKm: Number(distanciaKm.toFixed(1)) }));
  }

  async perfilProductor(id) {
    const productor = await this.repoUsuarios.obtenerOFallar(id);
    const cosechas = await this.repoCosechas.listar((c) => c.productorId === id);
    const reputacion = await this.reputacionService.reputacionDe(id);
    return {
      productor: productor.toJSON(),
      cosechas: cosechas.map((c) => ({ ...c.toJSON(), evaluacionPrecio: this.calculadoraPrecio.evaluar(c.producto, c.precioUnitario) })),
      reputacion,
    };
  }
}
