import { SeqTransport } from '@datalust/winston-seq';
import winston, { createLogger, format } from 'winston';
import pkg from 'winston/lib/winston/transports';

const { Console } = pkg;

const seqUrl = process.env.SEQ_URL || 'http://logs:5341';
const seqApiKey = process.env.SEQ_API_KEY || '';

const simplePrintfFormat = format.printf((info) => {
  const stringifiedRest = JSON.stringify(
    Object.assign({}, info, {
      level: undefined,
      message: undefined,
      splat: undefined,
      service: undefined,
      timestamp: undefined,
      req: undefined,
      res: undefined,
      receiver: undefined,
      txInfo: undefined,
    }),
  );

  return `[${info.timestamp}] ${info.level}${info.service ? ` [${info.service}] ` : ' '}${info.message} ${stringifiedRest}`;
});

const logger = createLogger({
  format: format.combine(format.errors({ stack: true }), winston.format.json()),
  exitOnError: false,
  transports: [
    new Console({
      format: format.combine(
        format.colorize({ message: true, level: true }),
        format.timestamp({ format: 'HH:mm:ss' }),
        simplePrintfFormat,
      ),
    }),
  ],
});

const seqOpts = {
  serverUrl: seqUrl,
  apiKey: seqApiKey,
  onError: (e: Error) => {
    console.error(e, 'err');
  },
  handleExceptions: true,
  handleRejections: true,
};
logger.add(new SeqTransport(seqOpts));
export default logger;
