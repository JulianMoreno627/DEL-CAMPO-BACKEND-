import { RepositorioMemoria } from './repositorios/Repositorio.js';
import { RepositorioUsuarios } from './repositorios/RepositorioUsuarios.js';
import { Cosecha } from './dominio/Cosecha.js';
import { Reserva } from './dominio/Reserva.js';
import { Calificacion } from './dominio/Reputacion.js';
import { CalculadoraPrecioJusto, EstrategiaPorcentajeMercado } from './dominio/PrecioReferencia.js';
import { crearUsuario } from './dominio/Usuario.js';
import { BusEventos } from './servicios/BusEventos.js';
import { CatalogoService } from './servicios/CatalogoService.js';
import { CosechaService } from './servicios/CosechaService.js';
import { ReservaService } from './servicios/ReservaService.js';
import { ReputacionService } from './servicios/ReputacionService.js';
import { SyncService } from './servicios/SyncService.js';
import { MetricasService } from './servicios/MetricasService.js';
import * as semilla from './datos/semilla.js';

/**
 * Raíz de composición (inyección de dependencias manual): aquí, y solo aquí,
 * se decide qué implementación concreta recibe cada servicio.
 */
export async function crearContenedor({ conSemilla = true } = {}) {
  const bus = new BusEventos();
  const repoUsuarios = new RepositorioUsuarios();
  const repoCosechas = new RepositorioMemoria('Cosecha', (d) => new Cosecha(d));
  const repoReservas = new RepositorioMemoria('Reserva', (d) => new Reserva(d));
  const repoCalificaciones = new RepositorioMemoria('Calificación', (d) => new Calificacion(d));

  const calculadoraPrecio = new CalculadoraPrecioJusto(new Map(semilla.preciosMercado), new EstrategiaPorcentajeMercado());

  const reputacionService = new ReputacionService({ repoCalificaciones, repoReservas, repoUsuarios });
  const catalogoService = new CatalogoService({ repoCosechas, repoUsuarios, calculadoraPrecio, reputacionService });
  const cosechaService = new CosechaService({ repoCosechas, repoUsuarios, bus });
  const reservaService = new ReservaService({ repoReservas, repoCosechas, repoUsuarios, bus });
  const syncService = new SyncService({ cosechaService, repoCosechas });
  const metricasService = new MetricasService();

  if (conSemilla) {
    for (const u of semilla.usuarios) await repoUsuarios.guardar(crearUsuario(u));
    for (const c of semilla.cosechas) await repoCosechas.guardar(new Cosecha(c));
    for (const c of semilla.calificaciones) await repoCalificaciones.guardar(new Calificacion(c));
  }

  return {
    bus, repoUsuarios, repoCosechas, repoReservas, repoCalificaciones, calculadoraPrecio,
    catalogoService, cosechaService, reservaService, reputacionService, syncService, metricasService,
  };
}
