import { InfluxDB, Point, WriteApi, QueryApi } from '@influxdata/influxdb-client';

// InfluxDB configuration from environment variables
const INFLUX_URL = process.env.INFLUX_URL || 'http://localhost:8086';
const INFLUX_TOKEN = process.env.INFLUX_TOKEN || '';
const INFLUX_ORG = process.env.INFLUX_ORG || 'default';
const INFLUX_BUCKET = process.env.INFLUX_BUCKET || 'dubber';

// Measurement name for TTS character tracking
const TTS_MEASUREMENT = 'tts_characters';

// Singleton InfluxDB client
let influxClient: InfluxDB | null = null;
let writeApi: WriteApi | null = null;
let queryApi: QueryApi | null = null;

/**
 * Check if InfluxDB is configured
 */
function isInfluxConfigured(): boolean {
  return Boolean(INFLUX_TOKEN && INFLUX_URL);
}

/**
 * Get or create InfluxDB client
 */
function getInfluxClient(): InfluxDB {
  if (!influxClient) {
    if (!isInfluxConfigured()) {
      throw new Error('InfluxDB is not configured. Set INFLUX_URL and INFLUX_TOKEN environment variables.');
    }
    influxClient = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN });
  }

  return influxClient;
}

/**
 * Get or create InfluxDB write API
 */
function getWriteApi(): WriteApi {
  if (!writeApi) {
    const client = getInfluxClient();
    writeApi = client.getWriteApi(INFLUX_ORG, INFLUX_BUCKET, 'ns');
  }
  return writeApi;
}

/**
 * Get or create InfluxDB query API
 */
function getQueryApi(): QueryApi {
  if (!queryApi) {
    const client = getInfluxClient();
    queryApi = client.getQueryApi(INFLUX_ORG);
  }
  return queryApi;
}

/**
 * Track TTS character count (only for cache misses - actual synthesis)
 * Fire-and-forget: logs errors but doesn't throw
 * 
 * @param characterCount Number of characters synthesized
 * @param timestamp Optional timestamp (defaults to current time)
 * @param metadata Optional metadata (jobId, userId for future expansion)
 */
export async function trackTTSCharacters(
  characterCount: number,
  timestamp?: Date,
  metadata?: { jobId?: string; userId?: string }
): Promise<void> {
  if (!isInfluxConfigured()) {
    console.warn('[INFLUX] InfluxDB not configured, skipping character tracking');
    return;
  }

  try {
    const api = getWriteApi();
    
    const point = new Point(TTS_MEASUREMENT)
      .intField('characters', characterCount);
    
    // Add optional tags for future filtering
    if (metadata?.jobId) {
      point.tag('job_id', metadata.jobId);
    }
    if (metadata?.userId) {
      point.tag('user_id', metadata.userId);
    }
    
    // Set timestamp if provided
    if (timestamp) {
      point.timestamp(timestamp);
    }
    
    api.writePoint(point);
    
    // Flush to ensure data is written (non-blocking)
    api.flush().catch((err) => {
      console.error('[INFLUX] Error flushing TTS character data:', err);
    });
    
    console.log(`[INFLUX] Tracked ${characterCount} TTS characters`);
  } catch (error) {
    console.error('[INFLUX] Error tracking TTS characters:', error);
    // Don't throw - this is fire-and-forget
  }
}

/**
 * Get total character count for the last N days
 * 
 * @param days Number of days to query (default: 30)
 * @returns Total character count
 */
export async function getCharacterCountForPeriod(days: number = 30): Promise<number> {
  if (!isInfluxConfigured()) {
    throw new Error('InfluxDB is not configured');
  }

  const api = getQueryApi();
  
  const query = `
    from(bucket: "${INFLUX_BUCKET}")
      |> range(start: -${days}d)
      |> filter(fn: (r) => r._measurement == "${TTS_MEASUREMENT}")
      |> filter(fn: (r) => r._field == "characters")
      |> sum()
  `;
  
  let totalCharacters = 0;
  
  return new Promise((resolve, reject) => {
    api.queryRows(query, {
      next(row, tableMeta) {
        const o = tableMeta.toObject(row);
        if (o._value !== undefined) {
          totalCharacters = Number(o._value);
        }
      },
      error(error) {
        console.error('[INFLUX] Error querying character count:', error);
        reject(error);
      },
      complete() {
        resolve(totalCharacters);
      },
    });
  });
}

/**
 * Get daily breakdown of character counts for the last N days
 * 
 * @param days Number of days to query (default: 30)
 * @returns Array of { date: string, characters: number }
 */
export async function getDailyCharacterBreakdown(days: number = 30): Promise<Array<{ date: string; characters: number }>> {
  if (!isInfluxConfigured()) {
    throw new Error('InfluxDB is not configured');
  }

  const api = getQueryApi();
  
  const query = `
    from(bucket: "${INFLUX_BUCKET}")
      |> range(start: -${days}d)
      |> filter(fn: (r) => r._measurement == "${TTS_MEASUREMENT}")
      |> filter(fn: (r) => r._field == "characters")
      |> aggregateWindow(every: 1d, fn: sum, createEmpty: true)
      |> yield(name: "daily")
  `;
  
  const breakdown: Array<{ date: string; characters: number }> = [];
  
  return new Promise((resolve, reject) => {
    api.queryRows(query, {
      next(row, tableMeta) {
        const o = tableMeta.toObject(row);
        if (o._time && o._value !== undefined) {
          breakdown.push({
            date: new Date(o._time).toISOString().split('T')[0],
            characters: Number(o._value) || 0,
          });
        }
      },
      error(error) {
        console.error('[INFLUX] Error querying daily breakdown:', error);
        reject(error);
      },
      complete() {
        // Sort by date ascending
        breakdown.sort((a, b) => a.date.localeCompare(b.date));
        resolve(breakdown);
      },
    });
  });
}

/**
 * Get character statistics summary
 * 
 * @param days Number of days to query (default: 30)
 * @returns Statistics summary object
 */
export async function getCharacterStats(days: number = 30): Promise<{
  totalCharacters: number;
  limit: number;
  usagePercent: number;
  remaining: number;
  dailyBreakdown: Array<{ date: string; characters: number }>;
}> {
  const MONTHLY_LIMIT = 4_000_000; // 4 million characters per month
  
  const [totalCharacters, dailyBreakdown] = await Promise.all([
    getCharacterCountForPeriod(days),
    getDailyCharacterBreakdown(days),
  ]);
  
  return {
    totalCharacters,
    limit: MONTHLY_LIMIT,
    usagePercent: (totalCharacters / MONTHLY_LIMIT) * 100,
    remaining: MONTHLY_LIMIT - totalCharacters,
    dailyBreakdown,
  };
}

/**
 * Close InfluxDB connections (for graceful shutdown)
 */
export async function closeInfluxConnection(): Promise<void> {
  if (writeApi) {
    try {
      await writeApi.close();
      writeApi = null;
    } catch (error) {
      console.error('[INFLUX] Error closing write API:', error);
    }
  }
  influxClient = null;
  queryApi = null;
}

