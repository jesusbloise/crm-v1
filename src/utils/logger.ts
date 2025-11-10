// src/utils/logger.ts
/**
 * Sistema de logging para el frontend
 * Evita console.logs en producción y permite diferentes niveles de logging
 */

// __DEV__ es definido por React Native/Expo automáticamente
const IS_DEV = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  enabledInProduction: LogLevel[];
  prefix?: string;
}

const DEFAULT_CONFIG: LoggerConfig = {
  // En producción solo mostramos warnings y errores
  enabledInProduction: ['warn', 'error'],
  prefix: '',
};

class Logger {
  private config: LoggerConfig;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private shouldLog(level: LogLevel): boolean {
    if (IS_DEV) return true;
    return this.config.enabledInProduction.includes(level);
  }

  private formatMessage(level: LogLevel, args: any[]): any[] {
    const prefix = this.config.prefix ? `[${this.config.prefix}]` : '';
    const timestamp = new Date().toISOString();
    
    if (IS_DEV) {
      // En dev, usamos emojis y colores
      const emoji = {
        debug: '🔍',
        info: 'ℹ️',
        warn: '⚠️',
        error: '❌',
      }[level];
      
      return [
        `${emoji} ${prefix}`,
        ...args,
      ];
    } else {
      // En prod, formato JSON estructurado
      return [
        JSON.stringify({
          level,
          timestamp,
          prefix: this.config.prefix,
          message: args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
          ).join(' '),
        }),
      ];
    }
  }

  /**
   * Debug: información detallada para debugging
   * Solo se muestra en desarrollo
   */
  debug(...args: any[]) {
    if (this.shouldLog('debug')) {
      console.log(...this.formatMessage('debug', args));
    }
  }

  /**
   * Info: información general del flujo de la aplicación
   * Solo se muestra en desarrollo
   */
  info(...args: any[]) {
    if (this.shouldLog('info')) {
      console.info(...this.formatMessage('info', args));
    }
  }

  /**
   * Warn: warnings que no son errores críticos
   * Se muestra en desarrollo y producción
   */
  warn(...args: any[]) {
    if (this.shouldLog('warn')) {
      console.warn(...this.formatMessage('warn', args));
    }
  }

  /**
   * Error: errores críticos
   * Se muestra en desarrollo y producción
   */
  error(...args: any[]) {
    if (this.shouldLog('error')) {
      console.error(...this.formatMessage('error', args));
    }
  }

  /**
   * Group: agrupa logs relacionados (solo en dev)
   */
  group(label: string) {
    if (IS_DEV && console.group) {
      console.group(label);
    }
  }

  groupEnd() {
    if (IS_DEV && console.groupEnd) {
      console.groupEnd();
    }
  }

  /**
   * Table: muestra datos en formato tabla (solo en dev)
   */
  table(data: any) {
    if (IS_DEV && console.table) {
      console.table(data);
    }
  }

  /**
   * Time: mide tiempo de ejecución (solo en dev)
   */
  time(label: string) {
    if (IS_DEV && console.time) {
      console.time(label);
    }
  }

  timeEnd(label: string) {
    if (IS_DEV && console.timeEnd) {
      console.timeEnd(label);
    }
  }
}

// Logger por defecto para uso general
export const logger = new Logger();

// Factory para crear loggers con prefijos personalizados
export const createLogger = (prefix: string, config?: Partial<LoggerConfig>) => {
  return new Logger({ ...config, prefix });
};

// Loggers especializados para diferentes módulos
export const authLogger = createLogger('AUTH');
export const apiLogger = createLogger('API');
export const roleLogger = createLogger('ROLES');
export const wsLogger = createLogger('WORKSPACE');

// Export IS_DEV para uso condicional
export { IS_DEV };

/**
 * Ejemplo de uso:
 * 
 * import { logger, authLogger, IS_DEV } from '@/src/utils/logger';
 * 
 * // General
 * logger.debug('Usuario cargado:', user);
 * logger.info('Navegando a pantalla:', screenName);
 * logger.warn('API lenta, timeout en 5s');
 * logger.error('Error crítico:', error);
 * 
 * // Especializado
 * authLogger.debug('Token obtenido:', token);
 * roleLogger.info('Rol actualizado:', newRole);
 * 
 * // Condicional
 * if (IS_DEV) {
 *   logger.table(users);
 * }
 * 
 * // Medir performance
 * logger.time('fetch-users');
 * await fetchUsers();
 * logger.timeEnd('fetch-users');
 */
