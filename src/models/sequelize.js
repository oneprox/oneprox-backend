const sequelizeModule = require('sequelize');
const Sequelize = sequelizeModule.Sequelize || sequelizeModule.default || sequelizeModule;

const DB_TYPE = (process.env.DB_TYPE || 'postgres').toLowerCase();
let sequelize;

// Connection pool configuration optimized for serverless environments
// Serverless functions have cold starts and may need connection reuse
const poolConfig = {
  max: 5, // Maximum number of connections in pool
  min: 0, // Minimum number of connections in pool
  acquire: 30000, // Maximum time (ms) to get connection before error
  idle: 10000, // Maximum time (ms) connection can be idle before release
};

// Additional configuration for serverless and Supabase
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV;

if (DB_TYPE === 'mysql') {
  sequelize = new Sequelize(
    process.env.MYSQL_DATABASE,
    process.env.MYSQL_USER,
    process.env.MYSQL_PASSWORD,
    {
      host: process.env.MYSQL_HOST,
      dialect: 'mysql',
      logging: false,
      pool: poolConfig,
      dialectOptions: {},
    }
  );
} else {
  // PostgreSQL - Use connection string or config.json
  const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.PGURI;
  
  let connectionUrl = DATABASE_URL || '';
  let isLocalDatabase = false;
  
  // If DATABASE_URL is not set, try to use config.json
  if (!DATABASE_URL) {
    try {
      const config = require('../../config/config.json');
      const dbConfig = config[process.env.NODE_ENV || 'postgres'] || config.postgres;
      
      if (dbConfig && dbConfig.host) {
        // Build connection string from config.json
        const host = dbConfig.host;
        const port = dbConfig.port || 5432;
        const database = dbConfig.database;
        const username = dbConfig.username;
        const password = dbConfig.password;
        
        connectionUrl = `postgresql://${username}:${password}@${host}:${port}/${database}`;
        
        // Check if this is a local database
        isLocalDatabase = host === 'localhost' || host === '127.0.0.1' || host === '::1';
        
        console.log('[Sequelize] Using config.json for database connection');
        console.log('[Sequelize] Host:', host, isLocalDatabase ? '(local)' : '(remote)');
      } else {
        console.error('[Sequelize] ERROR: DATABASE_URL is required for PostgreSQL!');
        console.error('[Sequelize] Please set DATABASE_URL, POSTGRES_URL, or PGURI environment variable');
        console.error('[Sequelize] Or configure database in config/config.json');
        throw new Error('DATABASE_URL is required for PostgreSQL');
      }
    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND') {
        console.error('[Sequelize] ERROR: DATABASE_URL is required for PostgreSQL!');
        console.error('[Sequelize] Please set DATABASE_URL, POSTGRES_URL, or PGURI environment variable');
        console.error('[Sequelize] Format: postgresql://user:password@host:port/database');
        throw new Error('DATABASE_URL is required for PostgreSQL');
      }
      throw error;
    }
  } else {
    // Parse and validate connection string
    try {
      const url = new URL(connectionUrl);
      const hostname = url.hostname;
      
      // Check if this is a local database
      isLocalDatabase = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
      
      // If hostname looks wrong (very short, no dots, etc.), password might not be encoded
      if (!isLocalDatabase && (hostname.length < 5 || (!hostname.includes('.') && !hostname.includes('localhost')))) {
        console.warn('[Sequelize] WARNING: Connection string hostname looks invalid:', hostname);
        console.warn('[Sequelize] This usually means password contains special characters that need URL encoding');
        console.warn('[Sequelize] Please URL-encode your password (e.g., @ -> %40, / -> %2F)');
      }
    } catch (e) {
      // URL parsing failed - might be malformed
      console.error('[Sequelize] ERROR: Connection string appears to be malformed');
      console.error('[Sequelize] Make sure passwords with special characters are URL-encoded');
      console.error('[Sequelize] Special characters that need encoding: @ %40, / %2F, : %3A, # %23, ? %3F, & %26');
      console.error(connectionUrl);
      throw new Error('Invalid DATABASE_URL format. Check password encoding.');
    }
  }
  
  // Check if this is a Supabase connection
  const isSupabase = connectionUrl.includes('.supabase.co') || connectionUrl.includes('supabase');
  
  // Remove any existing sslmode from URL to avoid conflicts (we'll use dialectOptions instead)
  if (connectionUrl.includes('sslmode=')) {
    connectionUrl = connectionUrl.replace(/[?&]sslmode=[^&]*/, '');
    // Clean up any orphaned ? or & at the end
    connectionUrl = connectionUrl.replace(/\?$/, '').replace(/&$/, '');
    if (isVercel || process.env.NODE_ENV !== 'production') {
      console.log('[Sequelize] Removed sslmode from URL - using dialectOptions instead');
    }
  }

  // SSL configuration - only enable for remote databases (not localhost)
  const postgresDialectOptions = {};
  
  if (!isLocalDatabase) {
    // For remote databases (Supabase, cloud databases), enable SSL
    postgresDialectOptions.ssl = {
      require: true,              // Require SSL connection
      rejectUnauthorized: false  // Don't reject self-signed certificates (required for Supabase)
    };
    
    if (isVercel || process.env.NODE_ENV !== 'production') {
      console.log('[Sequelize] SSL configured via dialectOptions:', {
        require: true,
        rejectUnauthorized: false,
        note: 'This allows self-signed certificates (required for Supabase)'
      });
    }
  } else {
    // For local database, disable SSL
    if (isVercel || process.env.NODE_ENV !== 'production') {
      console.log('[Sequelize] Local database detected - SSL disabled');
    }
  }

  // Log connection info (hide password, but show parsed hostname for debugging)
  if (isVercel || process.env.NODE_ENV !== 'production') {
    try {
      const url = new URL(connectionUrl);
      const safeUrl = connectionUrl.replace(/:[^:@]+@/, ':****@');
      console.log('[Sequelize] PostgreSQL connection:', {
        usingConnectionString: true,
        url: safeUrl,
        parsedHostname: url.hostname,
        parsedPort: url.port || '5432',
        parsedDatabase: url.pathname?.replace('/', '') || 'unknown',
        isLocalDatabase,
        isSupabase,
        sslInUrl: connectionUrl.includes('ssl'),
        hasSSL: !isLocalDatabase,
      });
    } catch (e) {
      const safeUrl = connectionUrl.replace(/:[^:@]+@/, ':****@');
      console.log('[Sequelize] PostgreSQL connection:', {
        usingConnectionString: true,
        url: safeUrl,
        parseError: 'Could not parse URL for validation',
        isLocalDatabase,
        isSupabase,
        sslInUrl: connectionUrl.includes('ssl'),
        hasSSL: !isLocalDatabase,
      });
    }
  }

  sequelize = new Sequelize(connectionUrl, {
    dialect: 'postgres',
    logging: false,
    pool: poolConfig,
    dialectOptions: postgresDialectOptions, // SSL only for remote databases
    dialectModule: require('pg'),
  });
}

module.exports = sequelize;
