import OmitCallSignature from "omit-call-signature";

/**
 * @tested_by tests/index.test.ts
 */
export namespace ApiErrors {
	export type ErrorType = { error: string };

	export class Error {
		errorCode: number;
		description: string;
		route: string | undefined;

		constructor(
			res: ApiResponse<ErrorType>,
			errorCode: number = 500,
			description: string = "The server encountered an error while processing the request",
		) {
			this.errorCode = errorCode;
			this.description = description;

			res.error(errorCode, description);
		}

		toString() {
			return `${this.errorCode}: ${this.description}`;
		}
	}

	export class NotFoundError extends Error {
		constructor(res: ApiResponse<ErrorType>, routeName: string) {
			super(res, 404, `This API Route (/${routeName}) does not exist`);
		}
	}

	export class InvalidRequestError extends Error {
		constructor(res: ApiResponse<ErrorType>) {
			super(res, 400, "Invalid Request");
		}
	}

	export class UnauthorizedError extends Error {
		constructor(res: ApiResponse<ErrorType>) {
			super(res, 403, "You are not authorized to execute this route");
		}
	}

	export class InternalServerError extends Error {
		constructor(res: ApiResponse<ErrorType>) {
			super(
				res,
				500,
				"The server encountered an error while processing the request",
			);
		}
	}
}

export interface HttpRequest {
	url?: string;
	body: any;
}

export interface ApiResponse<TSend> {
	send(data: TSend | ApiErrors.ErrorType): ApiResponse<TSend>;
	status(code: number): ApiResponse<TSend>;
	error(code: number, message: string): ApiResponse<TSend>;
}

export type Route<
	TArgs extends Array<any>,
	TReturn,
	TDependencies,
	TDataFetchedDuringAuth,
	TRequest extends HttpRequest = HttpRequest,
	TResponse extends ApiResponse<TReturn> = ApiResponse<TReturn>,
	TLocalDependencies extends object = {},
> = {
	subUrl: string;

	(...args: TArgs): Promise<TReturn>;
	beforeCall?: (deps: TLocalDependencies, args: TArgs) => Promise<TArgs>;
	afterResponse?: (
		deps: TLocalDependencies,
		res: TReturn,
		ranFallback: boolean,
	) => Promise<void>;
	fallback?: (deps: TLocalDependencies, args: TArgs) => Promise<TReturn>;

	isAuthorized: (
		req: TRequest,
		res: TResponse,
		deps: TDependencies,
		args: TArgs,
	) => Promise<{
		authorized: boolean;
		authData: TDataFetchedDuringAuth | undefined;
	}>;
	handler: (
		req: TRequest,
		res: TResponse,
		deps: TDependencies,
		authData: TDataFetchedDuringAuth,
		args: TArgs,
	) => Promise<any> | any;
};

export enum RequestMethod {
	POST = "POST",
	GET = "GET",
}

export class RequestHelper<TLocalDependencies extends object = {}> {
	constructor(
		public baseUrl: string,
		private onError: (url: string, error: any) => void,
		logPrefix: boolean = false,
	) {
		if (logPrefix) {
			console.log(`Constructed RequestHelper with baseUrl: ${this.baseUrl}`);
		}
	}

	async request<
		TArgs extends Array<any>,
		TReturn,
		TDependencies,
		TDataFetchedDuringAuth,
		TRequest extends HttpRequest = HttpRequest,
	>(
		route:
			| string
			| Route<
					TArgs,
					TReturn,
					TDependencies,
					TDataFetchedDuringAuth,
					TRequest,
					any,
					TLocalDependencies
			  >,
		body: any,
		method: RequestMethod = RequestMethod.POST,
	) {
		const parsedRoute =
			typeof route === "string"
				? ({ subUrl: route } as Route<
						TArgs,
						TReturn,
						TDependencies,
						TDataFetchedDuringAuth,
						TRequest
					>)
				: route;

		const deps = await this.getLocalDependencies();

		parsedRoute.beforeCall?.(deps, body);

		const rawResponse = await fetch(this.baseUrl + parsedRoute.subUrl, {
			method: method,
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		}).catch((e) => ({
			error: e,
		}));

		async function getRes(raw: Response | { error: any }) {
			if ("error" in raw) {
				return raw;
			}

			try {
				const text = await raw.text();
				// Null and undefined are sent as an empty string that we can't parse as JSON
				return text.length ? JSON.parse(text) : undefined;
			} catch (e) {
				return {
					error: `Failed to parse response (${method} ${parsedRoute.subUrl}): ${e}`,
				};
			}
		}

		const res = await getRes(rawResponse);

		if (res?.error) {
			if (parsedRoute.fallback) {
				return parsedRoute.fallback?.(deps, body).then((res) => {
					parsedRoute.afterResponse?.(deps, res, true);
					return res;
				});
			}

			this.onError(parsedRoute.subUrl, res.error);
		}

		parsedRoute.afterResponse?.(deps, res, false);

		return res;
	}

	async getLocalDependencies(): Promise<TLocalDependencies> {
		return {} as TLocalDependencies;
	}
}

/**
 * There's no easy one-liner to create a function with properties while maintaining typing, so I made this shortcut
 */
export function createRoute<
	TArgs extends Array<any>,
	TReturn,
	TDependencies,
	TFetchedDuringAuth,
	TRequest extends HttpRequest = HttpRequest,
	TResponse extends ApiResponse<TReturn> = ApiResponse<TReturn>,
>(
	config: Omit<
		OmitCallSignature<
			Route<
				TArgs,
				TReturn,
				TDependencies,
				TFetchedDuringAuth,
				TRequest,
				TResponse
			>
		>,
		"subUrl"
	>,
	clientHandler?: (...args: any) => Promise<any>,
): Route<
	TArgs,
	TReturn,
	TDependencies,
	TFetchedDuringAuth,
	TRequest,
	TResponse
> {
	return Object.assign(clientHandler ?? { subUrl: "newRoute" }, config) as any;
}

export type Segment<TDependencies> = {
	[route: string]: Segment<TDependencies> | Route<any, any, TDependencies, any>;
};

export abstract class ApiTemplate<
	TDependencies,
	TRequest extends HttpRequest = HttpRequest,
> {
	/**
	 * You need to pass false in subclasses and then call this.init()
	 * @param init Whether to call init() on construction. Pass false if calling super()
	 */
	constructor(
		public requestHelper: RequestHelper,
		init = true,
	) {
		if (init) {
			this.init();
		}
	}

	private initSegment(
		requestHelper: RequestHelper,
		segment: Segment<any>,
		subUrl: string,
	) {
		for (const [key, value] of Object.entries(segment)) {
			if (typeof value === "function") {
				value.subUrl = (subUrl ? subUrl + "/" : "") + key;
			} else if (
				(value as unknown as Route<any, any, TDependencies, any, TRequest>)
					.subUrl === "newRoute"
			) {
				const route = value as unknown as Route<any, any, TDependencies, any>;
				route.subUrl = (subUrl ? subUrl + "/" : "") + key;

				segment[key] = createRoute(route, (...args: any[]) =>
					requestHelper.request(route, args),
				);
			} else if (typeof value === "object") {
				this.initSegment(requestHelper, value, subUrl + "/" + key);
			}
		}
	}

	protected init() {
		this.initSegment(this.requestHelper, this as unknown as Segment<any>, "");
	}
}

export enum ErrorLogMode {
	Throw,
	Log,
	None,
}

export abstract class ServerApi<
	TDependencies,
	TRequest extends HttpRequest = HttpRequest,
	TResponse extends ApiResponse<any> = ApiResponse<any>,
> {
	private urlPrefix: string;

	constructor(
		private api: ApiTemplate<TDependencies>,
		private errorLogMode: ErrorLogMode = ErrorLogMode.Log,
		logPrefix: boolean = false,
	) {
		this.urlPrefix = api.requestHelper.baseUrl;
		if (logPrefix) {
			console.log(`Constructed ServerApi with urlPrefix: ${this.urlPrefix}`);
		}
	}

	async handle(req: TRequest, rawRes: any) {
		const res = this.parseRawResponse(rawRes);

		if (!req.url) {
			throw new ApiErrors.InvalidRequestError(res);
		}

		const path = req.url.slice(this.urlPrefix.length).split("/");

		try {
			const route = path.reduce(
				(segment, route) => Object(segment)[route],
				this.api,
			) as unknown as Route<any, any, TDependencies, any> | undefined;

			if (!route?.handler)
				throw new ApiErrors.NotFoundError(res, path.join("/"));

			const deps = this.getDependencies(req, res);
			const body = req.body;

			const { authorized, authData } = await route.isAuthorized(
				req,
				res,
				deps,
				body,
			);

			if (!authorized) throw new ApiErrors.UnauthorizedError(res);

			await route.handler(req, res, deps, authData, body);
		} catch (e) {
			(e as ApiErrors.Error).route = path.join("/");

			if (this.errorLogMode === ErrorLogMode.None) return;

			if (this.errorLogMode === ErrorLogMode.Throw) throw e;

			console.error(e);

			// If it's an error we've already handled, don't do anything
			if (e instanceof ApiErrors.Error) {
				return;
			}

			new ApiErrors.InternalServerError(res);
		}
	}

	protected parseRawResponse(rawRes: any): TResponse {
		return rawRes;
	}

	abstract getDependencies(req: TRequest, res: TResponse): TDependencies;
}
