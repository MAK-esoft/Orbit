import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Wraps every successful response in the standard envelope:
 *   { data, meta, error }
 *
 * If a handler returns an object shaped like `{ data, meta }` (e.g. paginated
 * results), the meta is hoisted into the envelope. Otherwise the raw value
 * becomes `data` with `meta: null`.
 */
export interface ResponseEnvelope<T> {
  data: T;
  meta: Record<string, unknown> | null;
  error: null;
}

@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, ResponseEnvelope<T>>
{
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<ResponseEnvelope<T>> {
    return next.handle().pipe(
      map((payload: any) => {
        if (
          payload &&
          typeof payload === 'object' &&
          'data' in payload &&
          'meta' in payload
        ) {
          return { data: payload.data, meta: payload.meta ?? null, error: null };
        }
        return { data: payload as T, meta: null, error: null };
      }),
    );
  }
}
