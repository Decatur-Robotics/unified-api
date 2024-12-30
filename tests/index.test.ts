import {
	ApiResponse,
	ApiTemplate,
	createRoute,
	ErrorLogMode,
	RequestHelper,
	ServerApi,
} from "../src";

const API_PREFIX = "api/";

type TestDependencies = {
	testDependency: string;
};

export class TestRes implements ApiResponse<any> {
	status = jest.fn((code) => this);
	send = jest.fn((obj) => this);
	error = jest.fn((code, message) => {
		this.status(code);
		this.send({ error: message });
		return this;
	});
}

class TestApi extends ApiTemplate<TestDependencies> {
	segment = {
		routeWithPresetCaller: createRoute<
			[string, number],
			string,
			TestDependencies,
			{}
		>(
			{
				isAuthorized: (req, res, deps, [name, number]) =>
					Promise.resolve({ authorized: true, authData: {} }),
				handler: (req, res, deps, authData, [name, number]) => {
					res.status(200).send(`Hello, ${name} ${number}!`);
				},
			},
			(name: string, number: number) => {
				return Promise.resolve(`Hello, ${name} ${number}!`);
			},
		),

		routeWithoutPresetCaller: createRoute({
			isAuthorized: (req, res, deps, [name, number]) =>
				Promise.resolve({ authorized: true, authData: {} }),
			handler: (req, res, deps, authData, [name, number]) => {
				res.status(200).send(`Hello, ${name} ${number}!`);
			},
		}),
	};

	rootRoute = createRoute({
		isAuthorized: (req, res, deps, [name, number]) =>
			Promise.resolve({ authorized: true, authData: {} }),
		handler: (req, res, deps, authData, [name, number]) => {
			res.status(200).send(`Hello, ${name} ${number}!`);
		},
	});

	unauthorizedRoute = createRoute({
		isAuthorized: (req, res, deps, args) =>
			Promise.resolve({ authorized: false, authData: undefined }),
		handler(req, res, deps, authData, args) {
			res.status(200).send("Should not be happening!");
		},
	});

	routeWithAuthData = createRoute({
		isAuthorized: (req, res, deps, args) =>
			Promise.resolve({ authorized: true, authData: { x: 0 } }),
		handler(req, res, deps, authData, args) {
			res.status(200).send(authData.x);
		},
	});

	constructor() {
		const requestHelper = new RequestHelper(API_PREFIX, () => {});
		super(requestHelper, false);
		this.init();
	}
}

class TestServerApi extends ServerApi<TestDependencies> {
	constructor() {
		super(new TestApi(), ErrorLogMode.None);
	}

	getDependencies() {
		return {
			testDependency: "test",
		};
	}
}

const clientApi = new TestApi();

test(`ApiLib.${createRoute.name}: Creates callable route`, async () => {
	const res = await clientApi.segment.routeWithPresetCaller("world", 42);
	expect(res).toBe("Hello, world 42!");
});

test(`ApiLib.${ApiTemplate.name}.init: Sets subUrl`, () => {
	expect(clientApi.segment.routeWithPresetCaller.subUrl).toBe(
		"/segment/routeWithPresetCaller",
	);
});

test(`ApiLib.${ApiTemplate.name}.init: Sets caller`, async () => {
	expect(clientApi.segment.routeWithPresetCaller.call).toBeDefined();
});

test(`ApiLib.${ApiTemplate.name}.init: Does not work without API_PREFIX`, async () => {
	class NoPrefixTestApi extends ApiTemplate<TestDependencies> {
		constructor() {
			const requestHelper = new RequestHelper(undefined as any, () => {});
			super(requestHelper, false);
			this.init();
		}
	}

	expect(() => new NoPrefixTestApi()).toThrow();
});

test(`ApiLib.${createRoute.name}: Creates callable route without caller`, async () => {
	expect(typeof clientApi.segment.routeWithoutPresetCaller).toBe("function");
	expect(clientApi.segment.routeWithoutPresetCaller.subUrl).toBe(
		"/segment/routeWithoutPresetCaller",
	);
});

test(`ApiLib.${ServerApi.name}.${ServerApi.prototype.handle.name}: Finds correct method`, async () => {
	const req = {
		url: API_PREFIX + "segment/routeWithoutPresetCaller",
		body: ["world", 42],
	};
	const res = new TestRes();

	await new TestServerApi().handle(req as any, res as any);

	expect(res.send).toHaveBeenCalledWith("Hello, world 42!");
	expect(res.status).toHaveBeenCalledWith(200);
});

test(`ApiLib.${ServerApi.name}.${ServerApi.prototype.handle.name}: Finds methods that are not in segments`, async () => {
	const req = {
		url: API_PREFIX + "rootRoute",
		body: ["world", 42],
	};
	const res = new TestRes();

	await new TestServerApi().handle(req as any, res as any);

	expect(res.send).toHaveBeenCalledWith("Hello, world 42!");
	expect(res.status).toHaveBeenCalledWith(200);
});

test(`ApiLib.${ServerApi.name}.${ServerApi.prototype.handle.name}: Throws 403 if unauthorized`, async () => {
	const req = {
		url: API_PREFIX + "unauthorizedRoute",
	};
	const res = new TestRes();

	await new TestServerApi().handle(req as any, res as any);

	expect(res.status).toHaveBeenCalledWith(403);
});

test(`ApiLib.${ServerApi.name}.${ServerApi.prototype.handle.name}: Passes authData to handler`, async () => {
	const req = {
		url: API_PREFIX + "routeWithAuthData",
	};
	const res = new TestRes();

	await new TestServerApi().handle(req as any, res as any);

	expect(res.send).toHaveBeenCalledWith(0);
});
