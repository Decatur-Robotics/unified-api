"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerApi = exports.ErrorLogMode = exports.ApiTemplate = exports.RequestHelper = exports.RequestMethod = exports.ApiErrors = void 0;
exports.createRoute = createRoute;
/**
 * @tested_by tests/index.test.ts
 */
var ApiErrors;
(function (ApiErrors) {
    class Error {
        constructor(res, errorCode = 500, description = "The server encountered an error while processing the request") {
            this.errorCode = errorCode;
            this.description = description;
            res.error(errorCode, description);
        }
        toString() {
            return `${this.errorCode}: ${this.description}`;
        }
    }
    ApiErrors.Error = Error;
    class NotFoundError extends Error {
        constructor(res, routeName) {
            super(res, 404, `This API Route (/${routeName}) does not exist`);
        }
    }
    ApiErrors.NotFoundError = NotFoundError;
    class InvalidRequestError extends Error {
        constructor(res) {
            super(res, 400, "Invalid Request");
        }
    }
    ApiErrors.InvalidRequestError = InvalidRequestError;
    class UnauthorizedError extends Error {
        constructor(res) {
            super(res, 403, "You are not authorized to execute this route");
        }
    }
    ApiErrors.UnauthorizedError = UnauthorizedError;
    class InternalServerError extends Error {
        constructor(res) {
            super(res, 500, "The server encountered an error while processing the request");
        }
    }
    ApiErrors.InternalServerError = InternalServerError;
})(ApiErrors || (exports.ApiErrors = ApiErrors = {}));
var RequestMethod;
(function (RequestMethod) {
    RequestMethod["POST"] = "POST";
    RequestMethod["GET"] = "GET";
})(RequestMethod || (exports.RequestMethod = RequestMethod = {}));
class RequestHelper {
    constructor(baseUrl, onError) {
        this.baseUrl = baseUrl;
        this.onError = onError;
    }
    request(url_1, body_1) {
        return __awaiter(this, arguments, void 0, function* (url, body, method = RequestMethod.POST) {
            const rawResponse = yield fetch(this.baseUrl + url, {
                method: method,
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            });
            // Null or undefined are sent as an empty string that we can't parse as JSON
            const text = yield rawResponse.text();
            const res = text.length ? JSON.parse(text) : undefined;
            if (res === null || res === void 0 ? void 0 : res.error) {
                this.onError(url);
                throw new Error(`${url}: ${res.error}`);
            }
            return res;
        });
    }
}
exports.RequestHelper = RequestHelper;
/**
 * There's no easy one-liner to create a function with properties while maintaining typing, so I made this shortcut
 */
function createRoute(server, clientHandler) {
    return Object.assign(clientHandler !== null && clientHandler !== void 0 ? clientHandler : { subUrl: "newRoute" }, server);
}
class ApiTemplate {
    /**
     * You need to pass false in subclasses and then call this.init()
     * @param init Whether to call init() on construction. Pass false if calling super()
     */
    constructor(requestHelper, init = true) {
        this.requestHelper = requestHelper;
        if (init) {
            this.init();
        }
    }
    initSegment(requestHelper, segment, subUrl) {
        for (const [key, value] of Object.entries(segment)) {
            if (typeof value === "function") {
                value.subUrl = subUrl + "/" + key;
            }
            else if (value
                .subUrl === "newRoute") {
                const route = value;
                route.subUrl = subUrl + "/" + key;
                segment[key] = createRoute(route, (...args) => requestHelper.request(route.subUrl, args));
            }
            else if (typeof value === "object") {
                this.initSegment(requestHelper, value, subUrl + "/" + key);
            }
        }
    }
    init() {
        this.initSegment(this.requestHelper, this, "");
    }
}
exports.ApiTemplate = ApiTemplate;
var ErrorLogMode;
(function (ErrorLogMode) {
    ErrorLogMode[ErrorLogMode["Throw"] = 0] = "Throw";
    ErrorLogMode[ErrorLogMode["Log"] = 1] = "Log";
    ErrorLogMode[ErrorLogMode["None"] = 2] = "None";
})(ErrorLogMode || (exports.ErrorLogMode = ErrorLogMode = {}));
class ServerApi {
    constructor(api, errorLogMode = ErrorLogMode.Log) {
        this.api = api;
        this.errorLogMode = errorLogMode;
        this.urlPrefix = api.requestHelper.baseUrl;
    }
    handle(req, rawRes) {
        return __awaiter(this, void 0, void 0, function* () {
            const res = this.parseRawResponse(rawRes);
            if (!req.url) {
                throw new ApiErrors.InvalidRequestError(res);
            }
            const path = req.url.slice(this.urlPrefix.length).split("/");
            try {
                const route = path.reduce((segment, route) => Object(segment)[route], this.api);
                if (!(route === null || route === void 0 ? void 0 : route.handler))
                    throw new ApiErrors.NotFoundError(res, path.join("/"));
                const deps = this.getDependencies(req, res);
                const body = req.body;
                const { authorized, authData } = yield route.isAuthorized(req, res, deps, body);
                if (!authorized)
                    throw new ApiErrors.UnauthorizedError(res);
                yield route.handler(req, res, deps, authData, body);
            }
            catch (e) {
                e.route = path.join("/");
                if (this.errorLogMode === ErrorLogMode.None)
                    return;
                if (this.errorLogMode === ErrorLogMode.Throw)
                    throw e;
                console.error(e);
                // If it's an error we've already handled, don't do anything
                if (e instanceof ApiErrors.Error) {
                    return;
                }
                new ApiErrors.InternalServerError(res);
            }
        });
    }
    parseRawResponse(rawRes) {
        return rawRes;
    }
}
exports.ServerApi = ServerApi;
