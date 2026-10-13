import { ErrorDominio } from './errores.js';

/**
 * Patrón Strategy: la forma de calcular el "precio justo" puede cambiar
 * (porcentaje del precio de mercado, costo de producción + margen, etc.)
 * sin modificar el servicio que lo usa.
 */
export class EstrategiaPrecioJusto {
  /** @returns {{ minimo: number, maximo: number }} */
  rango(_precioMercado) {
    throw new Error('Estrategia abstracta: implementar rango()');
  }
}

/**
 * Rango sugerido como fracción del precio promedio al consumidor en la ciudad.
 * Por defecto 60 %–85 %: el productor gana más de lo que le paga un intermediario
 * (~30 %–40 %) y el comprador paga menos que en la tienda.
 */
export class EstrategiaPorcentajeMercado extends EstrategiaPrecioJusto {
  constructor({ minimo = 0.6, maximo = 0.85 } = {}) {
    super();
    if (!(minimo > 0 && minimo < maximo)) throw new ErrorDominio('Porcentajes de precio inválidos');
    this.minimo = minimo;
    this.maximo = maximo;
  }

  rango(precioMercado) {
    return {
      minimo: Math.round(precioMercado * this.minimo),
      maximo: Math.round(precioMercado * this.maximo),
    };
  }
}

/** Calcula y evalúa el precio de un producto frente a la referencia de mercado. */
export class CalculadoraPrecioJusto {
  /**
   * @param {Map<string, {precioMercado:number, precioIntermediario:number, unidad:string}>} preciosMercado
   * @param {EstrategiaPrecioJusto} estrategia
   */
  constructor(preciosMercado, estrategia = new EstrategiaPorcentajeMercado()) {
    this.preciosMercado = preciosMercado;
    this.estrategia = estrategia;
  }

  referencia(producto) {
    const mercado = this.preciosMercado.get(producto.toLowerCase());
    if (!mercado) return null;
    return { producto, ...mercado, rangoJusto: this.estrategia.rango(mercado.precioMercado) };
  }

  /** @returns {'BAJO'|'JUSTO'|'ALTO'|'SIN_REFERENCIA'} */
  evaluar(producto, precio) {
    const ref = this.referencia(producto);
    if (!ref) return 'SIN_REFERENCIA';
    if (precio < ref.rangoJusto.minimo) return 'BAJO';
    if (precio > ref.rangoJusto.maximo) return 'ALTO';
    return 'JUSTO';
  }
}
