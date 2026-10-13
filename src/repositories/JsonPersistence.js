import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Saves the in-memory repositories to a JSON file so data survives a server restart
 * (users, products, carts, orders…).
 * It is an intermediate step towards a PostgresRepository: services do not notice the change.
 *
 * - Every change schedules a write; several changes in a row are grouped into one.
 * - It writes to a temporary file and then renames it: if the process stops halfway,
 *   the previous file stays intact (never a half-written JSON).
 */
export class JsonPersistence {
  #sources = new Map(); // collection name -> () => serializable data
  #scheduled = false;
  #writing = Promise.resolve();

  constructor(filePath) {
    this.filePath = filePath;
    this.initial = {};
  }

  /** @returns {Promise<boolean>} true if saved data already existed */
  async load() {
    try {
      this.initial = JSON.parse(await readFile(this.filePath, 'utf8'));
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw new Error(`Could not read ${this.filePath}: ${error.message}`);
    }
  }

  /** Generic collection: importData() receives what was saved (if any) and exportData() returns what will be saved. */
  register(name, { exportData, importData }) {
    this.#sources.set(name, exportData);
    if (name in this.initial) importData(this.initial[name]);
  }

  /** Connects an InMemoryRepository: loads its rows and saves every time it changes. */
  repository(name, repo) {
    this.register(name, {
      exportData: () => [...repo.rows.values()],
      importData: (rows) => { for (const row of rows) repo.rows.set(row.id, row); },
    });
    repo.onChange = () => this.scheduleSave();
  }

  scheduleSave() {
    if (this.#scheduled) return;
    this.#scheduled = true;
    setImmediate(() => {
      this.#scheduled = false;
      this.save();
    });
  }

  /** Writes are queued: never two at the same time on the same file. */
  save() {
    this.#writing = this.#writing.then(async () => {
      const data = Object.fromEntries([...this.#sources].map(([name, exportData]) => [name, exportData()]));
      const tempPath = `${this.filePath}.tmp`;
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await writeFile(tempPath, JSON.stringify(data, null, 2));
      await rename(tempPath, this.filePath);
    }).catch((error) => console.error('No se pudieron guardar los datos:', error));
    return this.#writing;
  }
}
