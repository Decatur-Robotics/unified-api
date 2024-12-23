# Easy API

Easy API lets you create APIs quickly and easily.

## Usage

### Creating endpoints

To get started, create a new subclass of `ApiTemplate<TDependencies>` and a type for your API's external dependencies,
like so:

```typescript
type TestDependencies = {
	testDependency: string; // Pretend we have to fetch this from our database
};

class TestApi extends ApiTemplate<TestDependencies> {
	constructor() {
		// First argument is the prefix for all API routes, second argument is a function that is called whenever a route throws an error.
		const requestHelper = new RequestHelper(API_PREFIX, () => {});
		super(requestHelper, false);
		this.init(); // Init configures API routes so they are ready to be called.
	}
}
```

Then, create a field in your API class for each endpoint, like so:

```typescript
class TestApi extends ApiTemplate<TestDependencies> {
	rootRoute = createRoute<[string, number], string, TestDependencies, {}>({
		isAuthorized: (req, res, deps, [name, number]) =>
			Promise.resolve({ authorized: true, authData: {} }),

		handler: (req, res, deps, authData, [name, number]) => {
			res.status(200).send(`Hello, ${name} ${number}!`);
		},
	});
}
```

`createRoute` is the function that creates an endpoint. It's generic parameters, in order, are:

- The type of the arguments that the endpoint takes, as an array. Ex: `[string, number]`
- The type of the return value of the endpoint. Ex: `string`
- The type of the dependencies that the endpoint uses. This should be the same as the `TDependency` generic parameter you passed to `ApiTemplate`. Ex: `TestDependencies`
- The type of the data that is fetched in the process of determining whether the request is authorized. Ex: `undefined`, `{}`

It takes an object with two fields: `isAuthorized` and `handler`.

`isAuthorized` is a function that determines whether the request is authorized. It takes the request, response, dependencies,
and arguments provided by the API call. It should return a promise that resolves to an object with two fields: `authorized`
and `authData`. `authData` is any data that was fetched in the process of determining whether the request is authorized.

`handler` is a function that handles the request. It takes the request, response, dependencies, authData, and arguments provided
by the API call. Use `res.status(code)` and `res.send(obj)` to respond to API requests.

### Responding to requests

Finally, create an subclass of `ServerApi<TDependencies>`, pass your API class and error logging mode (throw, log, or none) to the super constructor, and override the `getDependencies` method, like so:

```typescript
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
```

`getDependencies` must return an object of type `TDependencies`.

### Connecting your API to a web server

To connect your web server to your `ServerApi`, call the `handle` method and pass in the request and the response objects, like so:

```typescript
const serverApi = new TestServerApi();
await serverApi.handle(req, res); // await is optional
```

### Calling your API

To call your API, create an instance of your `ApiTemplate` subclass and call the appropriate method, like so:

```typescript
const clientApi = new TestApi();
await clientApi.requestHelper("Test", 1234); // await is optional
```

## Easy API © 2024 by Decatur Robotics is licensed under the MIT license.
