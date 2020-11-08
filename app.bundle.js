var Vue = function(exports) {
    'use strict';
    function makeMap(str, expectsLowerCase) {
        const map = Object.create(null);
        const list = str.split(',');
        for(let i = 0; i < list.length; i++){
            map[list[i]] = true;
        }
        return expectsLowerCase ? (val)=>!!map[val.toLowerCase()]
         : (val)=>!!map[val]
        ;
    }
    const PatchFlagNames = {
        [1]: `TEXT`,
        [2]: `CLASS`,
        [4]: `STYLE`,
        [8]: `PROPS`,
        [16]: `FULL_PROPS`,
        [32]: `HYDRATE_EVENTS`,
        [64]: `STABLE_FRAGMENT`,
        [128]: `KEYED_FRAGMENT`,
        [256]: `UNKEYED_FRAGMENT`,
        [1024]: `DYNAMIC_SLOTS`,
        [512]: `NEED_PATCH`,
        [-1]: `HOISTED`,
        [-2]: `BAIL`
    };
    const GLOBALS_WHITE_LISTED = 'Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,' + 'decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,' + 'Object,Boolean,String,RegExp,Map,Set,JSON,Intl';
    const isGloballyWhitelisted = makeMap(GLOBALS_WHITE_LISTED);
    const range = 2;
    function generateCodeFrame(source, start = 0, end = source.length) {
        const lines = source.split(/\r?\n/);
        let count = 0;
        const res = [];
        for(let i = 0; i < lines.length; i++){
            count += lines[i].length + 1;
            if (count >= start) {
                for(let j = i - 2; j <= i + 2 || end > count; j++){
                    if (j < 0 || j >= lines.length) continue;
                    const line = j + 1;
                    res.push(`${line}${' '.repeat(Math.max(3 - String(line).length, 0))}|  ${lines[j]}`);
                    const lineLength = lines[j].length;
                    if (j === i) {
                        const pad = start - (count - lineLength) + 1;
                        const length = Math.max(1, end > count ? lineLength - pad : end - start);
                        res.push(`   |  ` + ' '.repeat(pad) + '^'.repeat(length));
                    } else if (j > i) {
                        if (end > count) {
                            const length = Math.max(Math.min(end - count, lineLength), 1);
                            res.push(`   |  ` + '^'.repeat(length));
                        }
                        count += lineLength + 1;
                    }
                }
                break;
            }
        }
        return res.join('\n');
    }
    const specialBooleanAttrs = `itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly`;
    const isSpecialBooleanAttr = makeMap(specialBooleanAttrs);
    function normalizeStyle(value) {
        if (isArray(value)) {
            const res = {
            };
            for(let i = 0; i < value.length; i++){
                const item = value[i];
                const normalized = normalizeStyle(isString(item) ? parseStringStyle(item) : item);
                if (normalized) {
                    for(const key in normalized){
                        res[key] = normalized[key];
                    }
                }
            }
            return res;
        } else if (isObject(value)) {
            return value;
        }
    }
    const listDelimiterRE = /;(?![^(]*\))/g;
    const propertyDelimiterRE = /:(.+)/;
    function parseStringStyle(cssText) {
        const ret = {
        };
        cssText.split(/;(?![^(]*\))/g).forEach((item)=>{
            if (item) {
                const tmp = item.split(/:(.+)/);
                tmp.length > 1 && (ret[tmp[0].trim()] = tmp[1].trim());
            }
        });
        return ret;
    }
    function normalizeClass(value) {
        let res = '';
        if (isString(value)) {
            res = value;
        } else if (isArray(value)) {
            for(let i = 0; i < value.length; i++){
                res += normalizeClass(value[i]) + ' ';
            }
        } else if (isObject(value)) {
            for(const name in value){
                if (value[name]) {
                    res += name + ' ';
                }
            }
        }
        return res.trim();
    }
    const HTML_TAGS = 'html,body,base,head,link,meta,style,title,address,article,aside,footer,' + 'header,h1,h2,h3,h4,h5,h6,hgroup,nav,section,div,dd,dl,dt,figcaption,' + 'figure,picture,hr,img,li,main,ol,p,pre,ul,a,b,abbr,bdi,bdo,br,cite,code,' + 'data,dfn,em,i,kbd,mark,q,rp,rt,rtc,ruby,s,samp,small,span,strong,sub,sup,' + 'time,u,var,wbr,area,audio,map,track,video,embed,object,param,source,' + 'canvas,script,noscript,del,ins,caption,col,colgroup,table,thead,tbody,td,' + 'th,tr,button,datalist,fieldset,form,input,label,legend,meter,optgroup,' + 'option,output,progress,select,textarea,details,dialog,menu,' + 'summary,template,blockquote,iframe,tfoot';
    const SVG_TAGS = 'svg,animate,animateMotion,animateTransform,circle,clipPath,color-profile,' + 'defs,desc,discard,ellipse,feBlend,feColorMatrix,feComponentTransfer,' + 'feComposite,feConvolveMatrix,feDiffuseLighting,feDisplacementMap,' + 'feDistanceLight,feDropShadow,feFlood,feFuncA,feFuncB,feFuncG,feFuncR,' + 'feGaussianBlur,feImage,feMerge,feMergeNode,feMorphology,feOffset,' + 'fePointLight,feSpecularLighting,feSpotLight,feTile,feTurbulence,filter,' + 'foreignObject,g,hatch,hatchpath,image,line,linearGradient,marker,mask,' + 'mesh,meshgradient,meshpatch,meshrow,metadata,mpath,path,pattern,' + 'polygon,polyline,radialGradient,rect,set,solidcolor,stop,switch,symbol,' + 'text,textPath,title,tspan,unknown,use,view';
    const VOID_TAGS = 'area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr';
    const isHTMLTag = makeMap(HTML_TAGS);
    const isSVGTag = makeMap(SVG_TAGS);
    const isVoidTag = makeMap('area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr');
    function looseCompareArrays(a, b) {
        if (a.length !== b.length) return false;
        let equal = true;
        for(let i = 0; equal && i < a.length; i++){
            equal = looseEqual(a[i], b[i]);
        }
        return equal;
    }
    function looseEqual(a, b) {
        if (a === b) return true;
        let aValidType = isDate(a);
        let bValidType = isDate(b);
        if (aValidType || bValidType) {
            return aValidType && bValidType ? a.getTime() === b.getTime() : false;
        }
        aValidType = isArray(a);
        bValidType = isArray(b);
        if (aValidType || bValidType) {
            return aValidType && bValidType ? looseCompareArrays(a, b) : false;
        }
        aValidType = isObject(a);
        bValidType = isObject(b);
        if (aValidType || bValidType) {
            if (!aValidType || !bValidType) {
                return false;
            }
            const aKeysCount = Object.keys(a).length;
            const bKeysCount = Object.keys(b).length;
            if (aKeysCount !== bKeysCount) {
                return false;
            }
            for(const key in a){
                const aHasKey = a.hasOwnProperty(key);
                const bHasKey = b.hasOwnProperty(key);
                if (aHasKey && !bHasKey || !aHasKey && bHasKey || !looseEqual(a[key], b[key])) {
                    return false;
                }
            }
        }
        return String(a) === String(b);
    }
    function looseIndexOf(arr, val) {
        return arr.findIndex((item)=>looseEqual(item, val)
        );
    }
    const toDisplayString = (val)=>{
        return val == null ? '' : isObject(val) ? JSON.stringify(val, replacer, 2) : String(val);
    };
    const replacer = (_key, val)=>{
        if (isMap(val)) {
            return {
                [`Map(${val.size})`]: [
                    ...val.entries()
                ].reduce((entries, [key, val1])=>{
                    entries[`${key} =>`] = val1;
                    return entries;
                }, {
                })
            };
        } else if (isSet(val)) {
            return {
                [`Set(${val.size})`]: [
                    ...val.values()
                ]
            };
        } else if (isObject(val) && !isArray(val) && !isPlainObject(val)) {
            return String(val);
        }
        return val;
    };
    const EMPTY_OBJ = Object.freeze({
    });
    const EMPTY_ARR = Object.freeze([]);
    const NOOP = ()=>{
    };
    const NO = ()=>false
    ;
    const onRE = /^on[^a-z]/;
    const isOn = (key)=>/^on[^a-z]/.test(key)
    ;
    const isModelListener = (key)=>key.startsWith('onUpdate:')
    ;
    const extend = Object.assign;
    const remove1 = (arr, el)=>{
        const i = arr.indexOf(el);
        if (i > -1) {
            arr.splice(i, 1);
        }
    };
    const hasOwnProperty = Object.prototype.hasOwnProperty;
    const hasOwn = (val, key)=>hasOwnProperty.call(val, key)
    ;
    const isArray = Array.isArray;
    const isMap = (val)=>toTypeString(val) === '[object Map]'
    ;
    const isSet = (val)=>toTypeString(val) === '[object Set]'
    ;
    const isDate = (val)=>val instanceof Date
    ;
    const isFunction = (val)=>typeof val === 'function'
    ;
    const isString = (val)=>typeof val === 'string'
    ;
    const isSymbol = (val)=>typeof val === 'symbol'
    ;
    const isObject = (val)=>val !== null && typeof val === 'object'
    ;
    const isPromise = (val)=>{
        return isObject(val) && isFunction(val.then) && isFunction(val.catch);
    };
    const objectToString = Object.prototype.toString;
    const toTypeString = (value)=>objectToString.call(value)
    ;
    const toRawType = (value)=>{
        return toTypeString(value).slice(8, -1);
    };
    const isPlainObject = (val)=>toTypeString(val) === '[object Object]'
    ;
    const isIntegerKey = (key)=>isString(key) && key !== 'NaN' && key[0] !== '-' && '' + parseInt(key, 10) === key
    ;
    const isReservedProp = makeMap(',key,ref,' + 'onVnodeBeforeMount,onVnodeMounted,' + 'onVnodeBeforeUpdate,onVnodeUpdated,' + 'onVnodeBeforeUnmount,onVnodeUnmounted');
    const cacheStringFunction = (fn)=>{
        const cache = Object.create(null);
        return (str)=>{
            const hit = cache[str];
            return hit || (cache[str] = fn(str));
        };
    };
    const camelizeRE = /-(\w)/g;
    const camelize = cacheStringFunction((str)=>{
        return str.replace(/-(\w)/g, (_, c)=>c ? c.toUpperCase() : ''
        );
    });
    const hyphenateRE = /\B([A-Z])/g;
    const hyphenate = cacheStringFunction((str)=>str.replace(/\B([A-Z])/g, '-$1').toLowerCase()
    );
    const capitalize = cacheStringFunction((str)=>str.charAt(0).toUpperCase() + str.slice(1)
    );
    const toHandlerKey = cacheStringFunction((str)=>str ? `on${capitalize(str)}` : ``
    );
    const hasChanged = (value, oldValue)=>value !== oldValue && (value === value || oldValue === oldValue)
    ;
    const invokeArrayFns = (fns, arg)=>{
        for(let i = 0; i < fns.length; i++){
            fns[i](arg);
        }
    };
    const def = (obj, key, value)=>{
        Object.defineProperty(obj, key, {
            configurable: true,
            enumerable: false,
            value
        });
    };
    const toNumber = (val)=>{
        const n = parseFloat(val);
        return isNaN(n) ? val : n;
    };
    let _globalThis;
    const getGlobalThis = ()=>{
        return _globalThis || (_globalThis = typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : {
        });
    };
    const targetMap = new WeakMap();
    const effectStack = [];
    let activeEffect;
    const ITERATE_KEY = Symbol('iterate');
    const MAP_KEY_ITERATE_KEY = Symbol('Map key iterate');
    function isEffect(fn) {
        return fn && fn._isEffect === true;
    }
    function effect(fn, options = EMPTY_OBJ) {
        if (isEffect(fn)) {
            fn = fn.raw;
        }
        const effect1 = createReactiveEffect(fn, options);
        if (!options.lazy) {
            effect1();
        }
        return effect1;
    }
    function stop(effect1) {
        if (effect1.active) {
            cleanup1(effect1);
            if (effect1.options.onStop) {
                effect1.options.onStop();
            }
            effect1.active = false;
        }
    }
    let uid = 0;
    function createReactiveEffect(fn, options) {
        const effect1 = function reactiveEffect() {
            if (!effect1.active) {
                return options.scheduler ? undefined : fn();
            }
            if (!effectStack.includes(effect1)) {
                cleanup1(effect1);
                try {
                    enableTracking();
                    effectStack.push(effect1);
                    activeEffect = effect1;
                    return fn();
                } finally{
                    effectStack.pop();
                    resetTracking();
                    activeEffect = effectStack[effectStack.length - 1];
                }
            }
        };
        effect1.id = uid++;
        effect1.allowRecurse = !!options.allowRecurse;
        effect1._isEffect = true;
        effect1.active = true;
        effect1.raw = fn;
        effect1.deps = [];
        effect1.options = options;
        return effect1;
    }
    function cleanup1(effect1) {
        const { deps  } = effect1;
        if (deps.length) {
            for(let i = 0; i < deps.length; i++){
                deps[i].delete(effect1);
            }
            deps.length = 0;
        }
    }
    let shouldTrack = true;
    const trackStack = [];
    function pauseTracking() {
        trackStack.push(shouldTrack);
        shouldTrack = false;
    }
    function enableTracking() {
        trackStack.push(shouldTrack);
        shouldTrack = true;
    }
    function resetTracking() {
        const last = trackStack.pop();
        shouldTrack = last === undefined ? true : last;
    }
    function track(target, type, key) {
        if (!shouldTrack || activeEffect === undefined) {
            return;
        }
        let depsMap = targetMap.get(target);
        if (!depsMap) {
            targetMap.set(target, depsMap = new Map());
        }
        let dep = depsMap.get(key);
        if (!dep) {
            depsMap.set(key, dep = new Set());
        }
        if (!dep.has(activeEffect)) {
            dep.add(activeEffect);
            activeEffect.deps.push(dep);
            if (activeEffect.options.onTrack) {
                activeEffect.options.onTrack({
                    effect: activeEffect,
                    target,
                    type,
                    key
                });
            }
        }
    }
    function trigger(target, type, key, newValue, oldValue, oldTarget) {
        const depsMap = targetMap.get(target);
        if (!depsMap) {
            return;
        }
        const effects = new Set();
        const add = (effectsToAdd)=>{
            if (effectsToAdd) {
                effectsToAdd.forEach((effect1)=>{
                    if (effect1 !== activeEffect || effect1.allowRecurse) {
                        effects.add(effect1);
                    }
                });
            }
        };
        if (type === "clear") {
            depsMap.forEach(add);
        } else if (key === 'length' && isArray(target)) {
            depsMap.forEach((dep, key1)=>{
                if (key1 === 'length' || key1 >= newValue) {
                    add(dep);
                }
            });
        } else {
            if (key !== void 0) {
                add(depsMap.get(key));
            }
            switch(type){
                case "add":
                    if (!isArray(target)) {
                        add(depsMap.get(ITERATE_KEY));
                        if (isMap(target)) {
                            add(depsMap.get(MAP_KEY_ITERATE_KEY));
                        }
                    } else if (isIntegerKey(key)) {
                        add(depsMap.get('length'));
                    }
                    break;
                case "delete":
                    if (!isArray(target)) {
                        add(depsMap.get(ITERATE_KEY));
                        if (isMap(target)) {
                            add(depsMap.get(MAP_KEY_ITERATE_KEY));
                        }
                    }
                    break;
                case "set":
                    if (isMap(target)) {
                        add(depsMap.get(ITERATE_KEY));
                    }
                    break;
            }
        }
        const run = (effect1)=>{
            if (effect1.options.onTrigger) {
                effect1.options.onTrigger({
                    effect: effect1,
                    target,
                    key,
                    type,
                    newValue,
                    oldValue,
                    oldTarget
                });
            }
            if (effect1.options.scheduler) {
                effect1.options.scheduler(effect1);
            } else {
                effect1();
            }
        };
        effects.forEach(run);
    }
    const builtInSymbols = new Set(Object.getOwnPropertyNames(Symbol).map((key)=>Symbol[key]
    ).filter(isSymbol));
    const get = createGetter();
    const shallowGet = createGetter(false, true);
    const readonlyGet = createGetter(true);
    const shallowReadonlyGet = createGetter(true, true);
    const arrayInstrumentations = {
    };
    [
        'includes',
        'indexOf',
        'lastIndexOf'
    ].forEach((key)=>{
        const method = Array.prototype[key];
        arrayInstrumentations[key] = function(...args) {
            const arr = toRaw(this);
            for(let i = 0, l = this.length; i < l; i++){
                track(arr, "get", i + '');
            }
            const res = method.apply(arr, args);
            if (res === -1 || res === false) {
                return method.apply(arr, args.map(toRaw));
            } else {
                return res;
            }
        };
    });
    [
        'push',
        'pop',
        'shift',
        'unshift',
        'splice'
    ].forEach((key)=>{
        const method = Array.prototype[key];
        arrayInstrumentations[key] = function(...args) {
            pauseTracking();
            const res = method.apply(this, args);
            resetTracking();
            return res;
        };
    });
    function createGetter(isReadonly = false, shallow = false) {
        return function get1(target, key, receiver) {
            if (key === "__v_isReactive") {
                return !isReadonly;
            } else if (key === "__v_isReadonly") {
                return isReadonly;
            } else if (key === "__v_raw" && receiver === (isReadonly ? readonlyMap : reactiveMap).get(target)) {
                return target;
            }
            const targetIsArray = isArray(target);
            if (targetIsArray && hasOwn(arrayInstrumentations, key)) {
                return Reflect.get(arrayInstrumentations, key, receiver);
            }
            const res = Reflect.get(target, key, receiver);
            if (isSymbol(key) ? builtInSymbols.has(key) : key === `__proto__` || key === `__v_isRef`) {
                return res;
            }
            if (!isReadonly) {
                track(target, "get", key);
            }
            if (shallow) {
                return res;
            }
            if (isRef(res)) {
                const shouldUnwrap = !targetIsArray || !isIntegerKey(key);
                return shouldUnwrap ? res.value : res;
            }
            if (isObject(res)) {
                return isReadonly ? readonly(res) : reactive(res);
            }
            return res;
        };
    }
    const set = createSetter();
    const shallowSet = createSetter(true);
    function createSetter(shallow = false) {
        return function set1(target, key, value, receiver) {
            const oldValue = target[key];
            if (!shallow) {
                value = toRaw(value);
                if (!isArray(target) && isRef(oldValue) && !isRef(value)) {
                    oldValue.value = value;
                    return true;
                }
            }
            const hadKey = isArray(target) && isIntegerKey(key) ? Number(key) < target.length : hasOwn(target, key);
            const result = Reflect.set(target, key, value, receiver);
            if (target === toRaw(receiver)) {
                if (!hadKey) {
                    trigger(target, "add", key, value);
                } else if (hasChanged(value, oldValue)) {
                    trigger(target, "set", key, value, oldValue);
                }
            }
            return result;
        };
    }
    function deleteProperty(target, key) {
        const hadKey = hasOwn(target, key);
        const oldValue = target[key];
        const result = Reflect.deleteProperty(target, key);
        if (result && hadKey) {
            trigger(target, "delete", key, undefined, oldValue);
        }
        return result;
    }
    function has(target, key) {
        const result = Reflect.has(target, key);
        if (!isSymbol(key) || !builtInSymbols.has(key)) {
            track(target, "has", key);
        }
        return result;
    }
    function ownKeys(target) {
        track(target, "iterate", isArray(target) ? 'length' : ITERATE_KEY);
        return Reflect.ownKeys(target);
    }
    const mutableHandlers = {
        get,
        set,
        deleteProperty,
        has,
        ownKeys
    };
    const readonlyHandlers = {
        get: readonlyGet,
        set (target, key) {
            {
                console.warn(`Set operation on key "${String(key)}" failed: target is readonly.`, target);
            }
            return true;
        },
        deleteProperty (target, key) {
            {
                console.warn(`Delete operation on key "${String(key)}" failed: target is readonly.`, target);
            }
            return true;
        }
    };
    const shallowReactiveHandlers = extend({
    }, mutableHandlers, {
        get: shallowGet,
        set: shallowSet
    });
    const shallowReadonlyHandlers = extend({
    }, readonlyHandlers, {
        get: shallowReadonlyGet
    });
    const toReactive = (value)=>isObject(value) ? reactive(value) : value
    ;
    const toReadonly = (value)=>isObject(value) ? readonly(value) : value
    ;
    const toShallow = (value)=>value
    ;
    const getProto = (v)=>Reflect.getPrototypeOf(v)
    ;
    function get$1(target, key, isReadonly = false, isShallow = false) {
        target = target["__v_raw"];
        const rawTarget = toRaw(target);
        const rawKey = toRaw(key);
        if (key !== rawKey) {
            !isReadonly && track(rawTarget, "get", key);
        }
        !isReadonly && track(rawTarget, "get", rawKey);
        const { has: has1  } = getProto(rawTarget);
        const wrap = isReadonly ? toReadonly : isShallow ? toShallow : toReactive;
        if (has1.call(rawTarget, key)) {
            return wrap(target.get(key));
        } else if (has1.call(rawTarget, rawKey)) {
            return wrap(target.get(rawKey));
        }
    }
    function has$1(key, isReadonly = false) {
        const target = this["__v_raw"];
        const rawTarget = toRaw(target);
        const rawKey = toRaw(key);
        if (key !== rawKey) {
            !isReadonly && track(rawTarget, "has", key);
        }
        !isReadonly && track(rawTarget, "has", rawKey);
        return key === rawKey ? target.has(key) : target.has(key) || target.has(rawKey);
    }
    function size(target, isReadonly = false) {
        target = target["__v_raw"];
        !isReadonly && track(toRaw(target), "iterate", ITERATE_KEY);
        return Reflect.get(target, 'size', target);
    }
    function add(value) {
        value = toRaw(value);
        const target = toRaw(this);
        const proto = getProto(target);
        const hadKey = proto.has.call(target, value);
        const result = target.add(value);
        if (!hadKey) {
            trigger(target, "add", value, value);
        }
        return result;
    }
    function set$1(key, value) {
        value = toRaw(value);
        const target = toRaw(this);
        const { has: has1 , get: get1  } = getProto(target);
        let hadKey = has1.call(target, key);
        if (!hadKey) {
            key = toRaw(key);
            hadKey = has1.call(target, key);
        } else {
            checkIdentityKeys(target, has1, key);
        }
        const oldValue = get1.call(target, key);
        const result = target.set(key, value);
        if (!hadKey) {
            trigger(target, "add", key, value);
        } else if (hasChanged(value, oldValue)) {
            trigger(target, "set", key, value, oldValue);
        }
        return result;
    }
    function deleteEntry(key) {
        const target = toRaw(this);
        const { has: has1 , get: get1  } = getProto(target);
        let hadKey = has1.call(target, key);
        if (!hadKey) {
            key = toRaw(key);
            hadKey = has1.call(target, key);
        } else {
            checkIdentityKeys(target, has1, key);
        }
        const oldValue = get1 ? get1.call(target, key) : undefined;
        const result = target.delete(key);
        if (hadKey) {
            trigger(target, "delete", key, undefined, oldValue);
        }
        return result;
    }
    function clear() {
        const target = toRaw(this);
        const hadItems = target.size !== 0;
        const oldTarget = isMap(target) ? new Map(target) : new Set(target);
        const result = target.clear();
        if (hadItems) {
            trigger(target, "clear", undefined, undefined, oldTarget);
        }
        return result;
    }
    function createForEach(isReadonly, isShallow) {
        return function forEach(callback, thisArg) {
            const observed = this;
            const target = observed["__v_raw"];
            const rawTarget = toRaw(target);
            const wrap = isReadonly ? toReadonly : isShallow ? toShallow : toReactive;
            !isReadonly && track(rawTarget, "iterate", ITERATE_KEY);
            return target.forEach((value, key)=>{
                return callback.call(thisArg, wrap(value), wrap(key), observed);
            });
        };
    }
    function createIterableMethod(method, isReadonly, isShallow) {
        return function(...args) {
            const target = this["__v_raw"];
            const rawTarget = toRaw(target);
            const targetIsMap = isMap(rawTarget);
            const isPair = method === 'entries' || method === Symbol.iterator && targetIsMap;
            const isKeyOnly = method === 'keys' && targetIsMap;
            const innerIterator = target[method](...args);
            const wrap = isReadonly ? toReadonly : isShallow ? toShallow : toReactive;
            !isReadonly && track(rawTarget, "iterate", isKeyOnly ? MAP_KEY_ITERATE_KEY : ITERATE_KEY);
            return {
                next () {
                    const { value , done  } = innerIterator.next();
                    return done ? {
                        value,
                        done
                    } : {
                        value: isPair ? [
                            wrap(value[0]),
                            wrap(value[1])
                        ] : wrap(value),
                        done
                    };
                },
                [Symbol.iterator] () {
                    return this;
                }
            };
        };
    }
    function createReadonlyMethod(type) {
        return function(...args) {
            {
                const key = args[0] ? `on key "${args[0]}" ` : ``;
                console.warn(`${capitalize(type)} operation ${key}failed: target is readonly.`, toRaw(this));
            }
            return type === "delete" ? false : this;
        };
    }
    const mutableInstrumentations = {
        get (key) {
            return get$1(this, key);
        },
        get size () {
            return size(this);
        },
        has: has$1,
        add,
        set: set$1,
        delete: deleteEntry,
        clear,
        forEach: createForEach(false, false)
    };
    const shallowInstrumentations = {
        get (key) {
            return get$1(this, key, false, true);
        },
        get size () {
            return size(this);
        },
        has: has$1,
        add,
        set: set$1,
        delete: deleteEntry,
        clear,
        forEach: createForEach(false, true)
    };
    const readonlyInstrumentations = {
        get (key) {
            return get$1(this, key, true);
        },
        get size () {
            return size(this, true);
        },
        has (key) {
            return has$1.call(this, key, true);
        },
        add: createReadonlyMethod("add"),
        set: createReadonlyMethod("set"),
        delete: createReadonlyMethod("delete"),
        clear: createReadonlyMethod("clear"),
        forEach: createForEach(true, false)
    };
    const iteratorMethods = [
        'keys',
        'values',
        'entries',
        Symbol.iterator
    ];
    iteratorMethods.forEach((method)=>{
        mutableInstrumentations[method] = createIterableMethod(method, false, false);
        readonlyInstrumentations[method] = createIterableMethod(method, true, false);
        shallowInstrumentations[method] = createIterableMethod(method, false, true);
    });
    function createInstrumentationGetter(isReadonly, shallow) {
        const instrumentations = shallow ? shallowInstrumentations : isReadonly ? readonlyInstrumentations : mutableInstrumentations;
        return (target, key, receiver)=>{
            if (key === "__v_isReactive") {
                return !isReadonly;
            } else if (key === "__v_isReadonly") {
                return isReadonly;
            } else if (key === "__v_raw") {
                return target;
            }
            return Reflect.get(hasOwn(instrumentations, key) && key in target ? instrumentations : target, key, receiver);
        };
    }
    const mutableCollectionHandlers = {
        get: createInstrumentationGetter(false, false)
    };
    const shallowCollectionHandlers = {
        get: createInstrumentationGetter(false, true)
    };
    const readonlyCollectionHandlers = {
        get: createInstrumentationGetter(true, false)
    };
    function checkIdentityKeys(target, has1, key) {
        const rawKey = toRaw(key);
        if (rawKey !== key && has1.call(target, rawKey)) {
            const type = toRawType(target);
            console.warn(`Reactive ${type} contains both the raw and reactive ` + `versions of the same object${type === `Map` ? ` as keys` : ``}, ` + `which can lead to inconsistencies. ` + `Avoid differentiating between the raw and reactive versions ` + `of an object and only use the reactive version if possible.`);
        }
    }
    const reactiveMap = new WeakMap();
    const readonlyMap = new WeakMap();
    function targetTypeMap(rawType) {
        switch(rawType){
            case 'Object':
            case 'Array':
                return 1;
            case 'Map':
            case 'Set':
            case 'WeakMap':
            case 'WeakSet':
                return 2;
            default:
                return 0;
        }
    }
    function getTargetType(value) {
        return value["__v_skip"] || !Object.isExtensible(value) ? 0 : targetTypeMap(toRawType(value));
    }
    function reactive(target) {
        if (target && target["__v_isReadonly"]) {
            return target;
        }
        return createReactiveObject(target, false, mutableHandlers, mutableCollectionHandlers);
    }
    function shallowReactive(target) {
        return createReactiveObject(target, false, shallowReactiveHandlers, shallowCollectionHandlers);
    }
    function readonly(target) {
        return createReactiveObject(target, true, readonlyHandlers, readonlyCollectionHandlers);
    }
    function shallowReadonly(target) {
        return createReactiveObject(target, true, shallowReadonlyHandlers, readonlyCollectionHandlers);
    }
    function createReactiveObject(target, isReadonly, baseHandlers, collectionHandlers) {
        if (!isObject(target)) {
            {
                console.warn(`value cannot be made reactive: ${String(target)}`);
            }
            return target;
        }
        if (target["__v_raw"] && !(isReadonly && target["__v_isReactive"])) {
            return target;
        }
        const proxyMap = isReadonly ? readonlyMap : reactiveMap;
        const existingProxy = proxyMap.get(target);
        if (existingProxy) {
            return existingProxy;
        }
        const targetType = getTargetType(target);
        if (targetType === 0) {
            return target;
        }
        const proxy = new Proxy(target, targetType === 2 ? collectionHandlers : baseHandlers);
        proxyMap.set(target, proxy);
        return proxy;
    }
    function isReactive(value) {
        if (isReadonly(value)) {
            return isReactive(value["__v_raw"]);
        }
        return !!(value && value["__v_isReactive"]);
    }
    function isReadonly(value) {
        return !!(value && value["__v_isReadonly"]);
    }
    function isProxy(value) {
        return isReactive(value) || isReadonly(value);
    }
    function toRaw(observed) {
        return observed && toRaw(observed["__v_raw"]) || observed;
    }
    function markRaw(value) {
        def(value, "__v_skip", true);
        return value;
    }
    const convert = (val)=>isObject(val) ? reactive(val) : val
    ;
    function isRef(r) {
        return Boolean(r && r.__v_isRef === true);
    }
    function ref(value) {
        return createRef(value);
    }
    function shallowRef(value) {
        return createRef(value, true);
    }
    class RefImpl {
        constructor(_rawValue, _shallow = false){
            this._rawValue = _rawValue;
            this._shallow = _shallow;
            this.__v_isRef = true;
            this._value = _shallow ? _rawValue : convert(_rawValue);
        }
        get value() {
            track(toRaw(this), "get", 'value');
            return this._value;
        }
        set value(newVal) {
            if (hasChanged(toRaw(newVal), this._rawValue)) {
                this._rawValue = newVal;
                this._value = this._shallow ? newVal : convert(newVal);
                trigger(toRaw(this), "set", 'value', newVal);
            }
        }
    }
    function createRef(rawValue, shallow = false) {
        if (isRef(rawValue)) {
            return rawValue;
        }
        return new RefImpl(rawValue, shallow);
    }
    function triggerRef(ref1) {
        trigger(toRaw(ref1), "set", 'value', ref1.value);
    }
    function unref(ref1) {
        return isRef(ref1) ? ref1.value : ref1;
    }
    const shallowUnwrapHandlers = {
        get: (target, key, receiver)=>unref(Reflect.get(target, key, receiver))
        ,
        set: (target, key, value, receiver)=>{
            const oldValue = target[key];
            if (isRef(oldValue) && !isRef(value)) {
                oldValue.value = value;
                return true;
            } else {
                return Reflect.set(target, key, value, receiver);
            }
        }
    };
    function proxyRefs(objectWithRefs) {
        return isReactive(objectWithRefs) ? objectWithRefs : new Proxy(objectWithRefs, shallowUnwrapHandlers);
    }
    class CustomRefImpl {
        constructor(factory){
            this.__v_isRef = true;
            const { get: get1 , set: set1  } = factory(()=>track(this, "get", 'value')
            , ()=>trigger(this, "set", 'value')
            );
            this._get = get1;
            this._set = set1;
        }
        get value() {
            return this._get();
        }
        set value(newVal) {
            this._set(newVal);
        }
    }
    function customRef(factory1) {
        return new CustomRefImpl(factory1);
    }
    function toRefs(object) {
        if (!isProxy(object)) {
            console.warn(`toRefs() expects a reactive object but received a plain one.`);
        }
        const ret = isArray(object) ? new Array(object.length) : {
        };
        for(const key in object){
            ret[key] = toRef(object, key);
        }
        return ret;
    }
    class ObjectRefImpl {
        constructor(_object, _key){
            this._object = _object;
            this._key = _key;
            this.__v_isRef = true;
        }
        get value() {
            return this._object[this._key];
        }
        set value(newVal) {
            this._object[this._key] = newVal;
        }
    }
    function toRef(object, key) {
        return isRef(object[key]) ? object[key] : new ObjectRefImpl(object, key);
    }
    class ComputedRefImpl {
        constructor(getter, _setter, isReadonly1){
            this._setter = _setter;
            this._dirty = true;
            this.__v_isRef = true;
            this.effect = effect(getter, {
                lazy: true,
                scheduler: ()=>{
                    if (!this._dirty) {
                        this._dirty = true;
                        trigger(toRaw(this), "set", 'value');
                    }
                }
            });
            this["__v_isReadonly"] = isReadonly1;
        }
        get value() {
            if (this._dirty) {
                this._value = this.effect();
                this._dirty = false;
            }
            track(toRaw(this), "get", 'value');
            return this._value;
        }
        set value(newValue) {
            this._setter(newValue);
        }
    }
    function computed(getterOrOptions) {
        let getter1;
        let setter;
        if (isFunction(getterOrOptions)) {
            getter1 = getterOrOptions;
            setter = ()=>{
                console.warn('Write operation failed: computed value is readonly');
            };
        } else {
            getter1 = getterOrOptions.get;
            setter = getterOrOptions.set;
        }
        return new ComputedRefImpl(getter1, setter, isFunction(getterOrOptions) || !getterOrOptions.set);
    }
    const stack = [];
    function pushWarningContext(vnode) {
        stack.push(vnode);
    }
    function popWarningContext() {
        stack.pop();
    }
    function warn(msg, ...args) {
        pauseTracking();
        const instance = stack.length ? stack[stack.length - 1].component : null;
        const appWarnHandler = instance && instance.appContext.config.warnHandler;
        const trace = getComponentTrace();
        if (appWarnHandler) {
            callWithErrorHandling(appWarnHandler, instance, 11, [
                msg + args.join(''),
                instance && instance.proxy,
                trace.map(({ vnode  })=>`at <${formatComponentName(instance, vnode.type)}>`
                ).join('\n'),
                trace
            ]);
        } else {
            const warnArgs = [
                `[Vue warn]: ${msg}`,
                ...args
            ];
            if (trace.length && !false) {
                warnArgs.push(`\n`, ...formatTrace(trace));
            }
            console.warn(...warnArgs);
        }
        resetTracking();
    }
    function getComponentTrace() {
        let currentVNode = stack[stack.length - 1];
        if (!currentVNode) {
            return [];
        }
        const normalizedStack = [];
        while(currentVNode){
            const last = normalizedStack[0];
            if (last && last.vnode === currentVNode) {
                last.recurseCount++;
            } else {
                normalizedStack.push({
                    vnode: currentVNode,
                    recurseCount: 0
                });
            }
            const parentInstance = currentVNode.component && currentVNode.component.parent;
            currentVNode = parentInstance && parentInstance.vnode;
        }
        return normalizedStack;
    }
    function formatTrace(trace) {
        const logs = [];
        trace.forEach((entry, i)=>{
            logs.push(...i === 0 ? [] : [
                `\n`
            ], ...formatTraceEntry(entry));
        });
        return logs;
    }
    function formatTraceEntry({ vnode , recurseCount  }) {
        const postfix = recurseCount > 0 ? `... (${recurseCount} recursive calls)` : ``;
        const isRoot = vnode.component ? vnode.component.parent == null : false;
        const open = ` at <${formatComponentName(vnode.component, vnode.type, isRoot)}`;
        const close = `>` + postfix;
        return vnode.props ? [
            open,
            ...formatProps(vnode.props),
            close
        ] : [
            open + close
        ];
    }
    function formatProps(props) {
        const res = [];
        const keys = Object.keys(props);
        keys.slice(0, 3).forEach((key)=>{
            res.push(...formatProp(key, props[key]));
        });
        if (keys.length > 3) {
            res.push(` ...`);
        }
        return res;
    }
    function formatProp(key, value, raw) {
        if (isString(value)) {
            value = JSON.stringify(value);
            return raw ? value : [
                `${key}=${value}`
            ];
        } else if (typeof value === 'number' || typeof value === 'boolean' || value == null) {
            return raw ? value : [
                `${key}=${value}`
            ];
        } else if (isRef(value)) {
            value = formatProp(key, toRaw(value.value), true);
            return raw ? value : [
                `${key}=Ref<`,
                value,
                `>`
            ];
        } else if (isFunction(value)) {
            return [
                `${key}=fn${value.name ? `<${value.name}>` : ``}`
            ];
        } else {
            value = toRaw(value);
            return raw ? value : [
                `${key}=`,
                value
            ];
        }
    }
    const ErrorTypeStrings = {
        ["bc"]: 'beforeCreate hook',
        ["c"]: 'created hook',
        ["bm"]: 'beforeMount hook',
        ["m"]: 'mounted hook',
        ["bu"]: 'beforeUpdate hook',
        ["u"]: 'updated',
        ["bum"]: 'beforeUnmount hook',
        ["um"]: 'unmounted hook',
        ["a"]: 'activated hook',
        ["da"]: 'deactivated hook',
        ["ec"]: 'errorCaptured hook',
        ["rtc"]: 'renderTracked hook',
        ["rtg"]: 'renderTriggered hook',
        [0]: 'setup function',
        [1]: 'render function',
        [2]: 'watcher getter',
        [3]: 'watcher callback',
        [4]: 'watcher cleanup function',
        [5]: 'native event handler',
        [6]: 'component event handler',
        [7]: 'vnode hook',
        [8]: 'directive hook',
        [9]: 'transition hook',
        [10]: 'app errorHandler',
        [11]: 'app warnHandler',
        [12]: 'ref function',
        [13]: 'async component loader',
        [14]: 'scheduler flush. This is likely a Vue internals bug. ' + 'Please open an issue at https://new-issue.vuejs.org/?repo=vuejs/vue-next'
    };
    function callWithErrorHandling(fn, instance, type, args) {
        let res;
        try {
            res = args ? fn(...args) : fn();
        } catch (err) {
            handleError(err, instance, type);
        }
        return res;
    }
    function callWithAsyncErrorHandling(fn, instance, type, args) {
        if (isFunction(fn)) {
            const res = callWithErrorHandling(fn, instance, type, args);
            if (res && isPromise(res)) {
                res.catch((err)=>{
                    handleError(err, instance, type);
                });
            }
            return res;
        }
        const values = [];
        for(let i = 0; i < fn.length; i++){
            values.push(callWithAsyncErrorHandling(fn[i], instance, type, args));
        }
        return values;
    }
    function handleError(err, instance, type, throwInDev = true) {
        const contextVNode = instance ? instance.vnode : null;
        if (instance) {
            let cur = instance.parent;
            const exposedInstance = instance.proxy;
            const errorInfo = ErrorTypeStrings[type];
            while(cur){
                const errorCapturedHooks = cur.ec;
                if (errorCapturedHooks) {
                    for(let i = 0; i < errorCapturedHooks.length; i++){
                        if (errorCapturedHooks[i](err, exposedInstance, errorInfo) === false) {
                            return;
                        }
                    }
                }
                cur = cur.parent;
            }
            const appErrorHandler = instance.appContext.config.errorHandler;
            if (appErrorHandler) {
                callWithErrorHandling(appErrorHandler, null, 10, [
                    err,
                    exposedInstance,
                    errorInfo
                ]);
                return;
            }
        }
        logError(err, type, contextVNode, throwInDev);
    }
    function logError(err, type, contextVNode, throwInDev = true) {
        {
            const info = ErrorTypeStrings[type];
            if (contextVNode) {
                pushWarningContext(contextVNode);
            }
            warn(`Unhandled error${info ? ` during execution of ${info}` : ``}`);
            if (contextVNode) {
                popWarningContext();
            }
            if (throwInDev) {
                throw err;
            } else {
                console.error(err);
            }
        }
    }
    let isFlushing = false;
    let isFlushPending = false;
    const queue = [];
    let flushIndex = 0;
    const pendingPreFlushCbs = [];
    let activePreFlushCbs = null;
    let preFlushIndex = 0;
    const pendingPostFlushCbs = [];
    let activePostFlushCbs = null;
    let postFlushIndex = 0;
    const resolvedPromise = Promise.resolve();
    let currentFlushPromise = null;
    let currentPreFlushParentJob = null;
    const RECURSION_LIMIT = 100;
    function nextTick(fn) {
        const p = currentFlushPromise || resolvedPromise;
        return fn ? p.then(this ? fn.bind(this) : fn) : p;
    }
    function queueJob(job) {
        if ((!queue.length || !queue.includes(job, isFlushing && job.allowRecurse ? flushIndex + 1 : flushIndex)) && job !== currentPreFlushParentJob) {
            queue.push(job);
            queueFlush();
        }
    }
    function queueFlush() {
        if (!isFlushing && !isFlushPending) {
            isFlushPending = true;
            currentFlushPromise = resolvedPromise.then(flushJobs);
        }
    }
    function invalidateJob(job) {
        const i = queue.indexOf(job);
        if (i > -1) {
            queue[i] = null;
        }
    }
    function queueCb(cb, activeQueue, pendingQueue, index) {
        if (!isArray(cb)) {
            if (!activeQueue || !activeQueue.includes(cb, cb.allowRecurse ? index + 1 : index)) {
                pendingQueue.push(cb);
            }
        } else {
            pendingQueue.push(...cb);
        }
        queueFlush();
    }
    function queuePreFlushCb(cb) {
        queueCb(cb, activePreFlushCbs, pendingPreFlushCbs, preFlushIndex);
    }
    function queuePostFlushCb(cb) {
        queueCb(cb, activePostFlushCbs, pendingPostFlushCbs, postFlushIndex);
    }
    function flushPreFlushCbs(seen, parentJob = null) {
        if (pendingPreFlushCbs.length) {
            currentPreFlushParentJob = parentJob;
            activePreFlushCbs = [
                ...new Set(pendingPreFlushCbs)
            ];
            pendingPreFlushCbs.length = 0;
            {
                seen = seen || new Map();
            }
            for(preFlushIndex = 0; preFlushIndex < activePreFlushCbs.length; preFlushIndex++){
                {
                    checkRecursiveUpdates(seen, activePreFlushCbs[preFlushIndex]);
                }
                activePreFlushCbs[preFlushIndex]();
            }
            activePreFlushCbs = null;
            preFlushIndex = 0;
            currentPreFlushParentJob = null;
            flushPreFlushCbs(seen, parentJob);
        }
    }
    function flushPostFlushCbs(seen) {
        if (pendingPostFlushCbs.length) {
            const deduped = [
                ...new Set(pendingPostFlushCbs)
            ];
            pendingPostFlushCbs.length = 0;
            if (activePostFlushCbs) {
                activePostFlushCbs.push(...deduped);
                return;
            }
            activePostFlushCbs = deduped;
            {
                seen = seen || new Map();
            }
            activePostFlushCbs.sort((a, b)=>getId(a) - getId(b)
            );
            for(postFlushIndex = 0; postFlushIndex < activePostFlushCbs.length; postFlushIndex++){
                {
                    checkRecursiveUpdates(seen, activePostFlushCbs[postFlushIndex]);
                }
                activePostFlushCbs[postFlushIndex]();
            }
            activePostFlushCbs = null;
            postFlushIndex = 0;
        }
    }
    const getId = (job)=>job.id == null ? Infinity : job.id
    ;
    function flushJobs(seen) {
        isFlushPending = false;
        isFlushing = true;
        {
            seen = seen || new Map();
        }
        flushPreFlushCbs(seen);
        queue.sort((a, b)=>getId(a) - getId(b)
        );
        try {
            for(flushIndex = 0; flushIndex < queue.length; flushIndex++){
                const job = queue[flushIndex];
                if (job) {
                    if (true) {
                        checkRecursiveUpdates(seen, job);
                    }
                    callWithErrorHandling(job, null, 14);
                }
            }
        } finally{
            flushIndex = 0;
            queue.length = 0;
            flushPostFlushCbs(seen);
            isFlushing = false;
            currentFlushPromise = null;
            if (queue.length || pendingPostFlushCbs.length) {
                flushJobs(seen);
            }
        }
    }
    function checkRecursiveUpdates(seen, fn) {
        if (!seen.has(fn)) {
            seen.set(fn, 1);
        } else {
            const count = seen.get(fn);
            if (count > 100) {
                throw new Error(`Maximum recursive updates exceeded. ` + `This means you have a reactive effect that is mutating its own ` + `dependencies and thus recursively triggering itself. Possible sources ` + `include component template, render function, updated hook or ` + `watcher source function.`);
            } else {
                seen.set(fn, count + 1);
            }
        }
    }
    let isHmrUpdating = false;
    const hmrDirtyComponents = new Set();
    {
        const globalObject = typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : {
        };
        globalObject.__VUE_HMR_RUNTIME__ = {
            createRecord: tryWrap(createRecord),
            rerender: tryWrap(rerender),
            reload: tryWrap(reload)
        };
    }
    const map = new Map();
    function registerHMR(instance) {
        const id = instance.type.__hmrId;
        let record = map.get(id);
        if (!record) {
            createRecord(id);
            record = map.get(id);
        }
        record.add(instance);
    }
    function unregisterHMR(instance) {
        map.get(instance.type.__hmrId).delete(instance);
    }
    function createRecord(id) {
        if (map.has(id)) {
            return false;
        }
        map.set(id, new Set());
        return true;
    }
    function rerender(id, newRender) {
        const record = map.get(id);
        if (!record) return;
        Array.from(record).forEach((instance)=>{
            if (newRender) {
                instance.render = newRender;
            }
            instance.renderCache = [];
            isHmrUpdating = true;
            instance.update();
            isHmrUpdating = false;
        });
    }
    function reload(id, newComp) {
        const record = map.get(id);
        if (!record) return;
        Array.from(record).forEach((instance)=>{
            const comp = instance.type;
            if (!hmrDirtyComponents.has(comp)) {
                newComp = isClassComponent(newComp) ? newComp.__vccOpts : newComp;
                extend(comp, newComp);
                for(const key in comp){
                    if (!(key in newComp)) {
                        delete comp[key];
                    }
                }
                hmrDirtyComponents.add(comp);
                queuePostFlushCb(()=>{
                    hmrDirtyComponents.delete(comp);
                });
            }
            if (instance.parent) {
                queueJob(instance.parent.update);
            } else if (instance.appContext.reload) {
                instance.appContext.reload();
            } else if (typeof window !== 'undefined') {
                window.location.reload();
            } else {
                console.warn('[HMR] Root or manually mounted instance modified. Full reload required.');
            }
        });
    }
    function tryWrap(fn) {
        return (id, arg)=>{
            try {
                return fn(id, arg);
            } catch (e) {
                console.error(e);
                console.warn(`[HMR] Something went wrong during Vue component hot-reload. ` + `Full reload required.`);
            }
        };
    }
    function setDevtoolsHook(hook) {
        exports.devtools = hook;
    }
    function devtoolsInitApp(app, version) {
        if (!exports.devtools) return;
        exports.devtools.emit("app:init", app, version, {
            Fragment,
            Text: Text1,
            Comment: Comment1,
            Static
        });
    }
    function devtoolsUnmountApp(app) {
        if (!exports.devtools) return;
        exports.devtools.emit("app:unmount", app);
    }
    const devtoolsComponentAdded = createDevtoolsComponentHook("component:added");
    const devtoolsComponentUpdated = createDevtoolsComponentHook("component:updated");
    const devtoolsComponentRemoved = createDevtoolsComponentHook("component:removed");
    function createDevtoolsComponentHook(hook) {
        return (component)=>{
            if (!exports.devtools) return;
            exports.devtools.emit(hook, component.appContext.app, component.uid, component.parent ? component.parent.uid : undefined);
        };
    }
    function devtoolsComponentEmit(component, event, params) {
        if (!exports.devtools) return;
        exports.devtools.emit("component:emit", component.appContext.app, component, event, params);
    }
    function emit(instance, event, ...rawArgs) {
        const props = instance.vnode.props || EMPTY_OBJ;
        {
            const { emitsOptions , propsOptions: [propsOptions]  } = instance;
            if (emitsOptions) {
                if (!(event in emitsOptions)) {
                    if (!propsOptions || !(toHandlerKey(event) in propsOptions)) {
                        warn(`Component emitted event "${event}" but it is neither declared in ` + `the emits option nor as an "${toHandlerKey(event)}" prop.`);
                    }
                } else {
                    const validator = emitsOptions[event];
                    if (isFunction(validator)) {
                        const isValid = validator(...rawArgs);
                        if (!isValid) {
                            warn(`Invalid event arguments: event validation failed for event "${event}".`);
                        }
                    }
                }
            }
        }
        let args = rawArgs;
        const isModelListener1 = event.startsWith('update:');
        const modelArg = isModelListener1 && event.slice(7);
        if (modelArg && modelArg in props) {
            const modifiersKey = `${modelArg === 'modelValue' ? 'model' : modelArg}Modifiers`;
            const { number , trim  } = props[modifiersKey] || EMPTY_OBJ;
            if (trim) {
                args = rawArgs.map((a)=>a.trim()
                );
            } else if (number) {
                args = rawArgs.map(toNumber);
            }
        }
        {
            devtoolsComponentEmit(instance, event, args);
        }
        {
            const lowerCaseEvent = event.toLowerCase();
            if (lowerCaseEvent !== event && props[toHandlerKey(lowerCaseEvent)]) {
                warn(`Event "${lowerCaseEvent}" is emitted in component ` + `${formatComponentName(instance, instance.type)} but the handler is registered for "${event}". ` + `Note that HTML attributes are case-insensitive and you cannot use ` + `v-on to listen to camelCase events when using in-DOM templates. ` + `You should probably use "${hyphenate(event)}" instead of "${event}".`);
            }
        }
        let handlerName = toHandlerKey(camelize(event));
        let handler = props[handlerName];
        if (!handler && isModelListener1) {
            handlerName = toHandlerKey(hyphenate(event));
            handler = props[handlerName];
        }
        if (handler) {
            callWithAsyncErrorHandling(handler, instance, 6, args);
        }
        const onceHandler = props[handlerName + `Once`];
        if (onceHandler) {
            if (!instance.emitted) {
                (instance.emitted = {
                })[handlerName] = true;
            } else if (instance.emitted[handlerName]) {
                return;
            }
            callWithAsyncErrorHandling(onceHandler, instance, 6, args);
        }
    }
    function normalizeEmitsOptions(comp, appContext, asMixin = false) {
        if (!appContext.deopt && comp.__emits !== undefined) {
            return comp.__emits;
        }
        const raw = comp.emits;
        let normalized = {
        };
        let hasExtends = false;
        if (!isFunction(comp)) {
            const extendEmits = (raw1)=>{
                hasExtends = true;
                extend(normalized, normalizeEmitsOptions(raw1, appContext, true));
            };
            if (!asMixin && appContext.mixins.length) {
                appContext.mixins.forEach(extendEmits);
            }
            if (comp.extends) {
                extendEmits(comp.extends);
            }
            if (comp.mixins) {
                comp.mixins.forEach(extendEmits);
            }
        }
        if (!raw && !hasExtends) {
            return comp.__emits = null;
        }
        if (isArray(raw)) {
            raw.forEach((key)=>normalized[key] = null
            );
        } else {
            extend(normalized, raw);
        }
        return comp.__emits = normalized;
    }
    function isEmitListener(options, key) {
        if (!options || !isOn(key)) {
            return false;
        }
        key = key.replace(/Once$/, '');
        return hasOwn(options, key[2].toLowerCase() + key.slice(3)) || hasOwn(options, key.slice(2));
    }
    let currentRenderingInstance = null;
    function setCurrentRenderingInstance(instance) {
        currentRenderingInstance = instance;
    }
    let accessedAttrs = false;
    function markAttrsAccessed() {
        accessedAttrs = true;
    }
    function renderComponentRoot(instance) {
        const { type: Component , vnode , proxy , withProxy , props , propsOptions: [propsOptions] , slots , attrs , emit: emit1 , render , renderCache , data , setupState , ctx  } = instance;
        let result;
        currentRenderingInstance = instance;
        {
            accessedAttrs = false;
        }
        try {
            let fallthroughAttrs;
            if (vnode.shapeFlag & 4) {
                const proxyToUse = withProxy || proxy;
                result = normalizeVNode(render.call(proxyToUse, proxyToUse, renderCache, props, setupState, data, ctx));
                fallthroughAttrs = attrs;
            } else {
                const render1 = Component;
                if (true && attrs === props) {
                    markAttrsAccessed();
                }
                result = normalizeVNode(render1.length > 1 ? render1(props, true ? {
                    get attrs () {
                        markAttrsAccessed();
                        return attrs;
                    },
                    slots,
                    emit: emit1
                } : {
                    attrs,
                    slots,
                    emit: emit1
                }) : render1(props, null));
                fallthroughAttrs = Component.props ? attrs : getFunctionalFallthrough(attrs);
            }
            let root = result;
            let setRoot = undefined;
            if (true) {
                [root, setRoot] = getChildRoot(result);
            }
            if (Component.inheritAttrs !== false && fallthroughAttrs) {
                const keys = Object.keys(fallthroughAttrs);
                const { shapeFlag  } = root;
                if (keys.length) {
                    if (shapeFlag & 1 || shapeFlag & 6) {
                        if (propsOptions && keys.some(isModelListener)) {
                            fallthroughAttrs = filterModelListeners(fallthroughAttrs, propsOptions);
                        }
                        root = cloneVNode(root, fallthroughAttrs);
                    } else if (true && !accessedAttrs && root.type !== Comment1) {
                        const allAttrs = Object.keys(attrs);
                        const eventAttrs = [];
                        const extraAttrs = [];
                        for(let i = 0, l = allAttrs.length; i < l; i++){
                            const key = allAttrs[i];
                            if (isOn(key)) {
                                if (!isModelListener(key)) {
                                    eventAttrs.push(key[2].toLowerCase() + key.slice(3));
                                }
                            } else {
                                extraAttrs.push(key);
                            }
                        }
                        if (extraAttrs.length) {
                            warn(`Extraneous non-props attributes (` + `${extraAttrs.join(', ')}) ` + `were passed to component but could not be automatically inherited ` + `because component renders fragment or text root nodes.`);
                        }
                        if (eventAttrs.length) {
                            warn(`Extraneous non-emits event listeners (` + `${eventAttrs.join(', ')}) ` + `were passed to component but could not be automatically inherited ` + `because component renders fragment or text root nodes. ` + `If the listener is intended to be a component custom event listener only, ` + `declare it using the "emits" option.`);
                        }
                    }
                }
            }
            if (vnode.dirs) {
                if (true && !isElementRoot(root)) {
                    warn(`Runtime directive used on component with non-element root node. ` + `The directives will not function as intended.`);
                }
                root.dirs = root.dirs ? root.dirs.concat(vnode.dirs) : vnode.dirs;
            }
            if (vnode.transition) {
                if (true && !isElementRoot(root)) {
                    warn(`Component inside <Transition> renders non-element root node ` + `that cannot be animated.`);
                }
                root.transition = vnode.transition;
            }
            if (true && setRoot) {
                setRoot(root);
            } else {
                result = root;
            }
        } catch (err) {
            handleError(err, instance, 1);
            result = createVNodeWithArgsTransform(Comment1);
        }
        currentRenderingInstance = null;
        return result;
    }
    const getChildRoot = (vnode)=>{
        if (vnode.type !== Fragment) {
            return [
                vnode,
                undefined
            ];
        }
        const rawChildren = vnode.children;
        const dynamicChildren = vnode.dynamicChildren;
        const childRoot = filterSingleRoot(rawChildren);
        if (!childRoot) {
            return [
                vnode,
                undefined
            ];
        }
        const index = rawChildren.indexOf(childRoot);
        const dynamicIndex = dynamicChildren ? dynamicChildren.indexOf(childRoot) : -1;
        const setRoot = (updatedRoot)=>{
            rawChildren[index] = updatedRoot;
            if (dynamicChildren) {
                if (dynamicIndex > -1) {
                    dynamicChildren[dynamicIndex] = updatedRoot;
                } else if (updatedRoot.patchFlag > 0) {
                    vnode.dynamicChildren = [
                        ...dynamicChildren,
                        updatedRoot
                    ];
                }
            }
        };
        return [
            normalizeVNode(childRoot),
            setRoot
        ];
    };
    function filterSingleRoot(children) {
        const filtered = children.filter((child)=>{
            return !(isVNode1(child) && child.type === Comment1 && child.children !== 'v-if');
        });
        return filtered.length === 1 && isVNode1(filtered[0]) ? filtered[0] : null;
    }
    const getFunctionalFallthrough = (attrs)=>{
        let res;
        for(const key in attrs){
            if (key === 'class' || key === 'style' || isOn(key)) {
                (res || (res = {
                }))[key] = attrs[key];
            }
        }
        return res;
    };
    const filterModelListeners = (attrs, props)=>{
        const res = {
        };
        for(const key in attrs){
            if (!isModelListener(key) || !(key.slice(9) in props)) {
                res[key] = attrs[key];
            }
        }
        return res;
    };
    const isElementRoot = (vnode)=>{
        return vnode.shapeFlag & 6 || vnode.shapeFlag & 1 || vnode.type === Comment1;
    };
    function shouldUpdateComponent(prevVNode, nextVNode, optimized) {
        const { props: prevProps , children: prevChildren , component  } = prevVNode;
        const { props: nextProps , children: nextChildren , patchFlag  } = nextVNode;
        const emits = component.emitsOptions;
        if ((prevChildren || nextChildren) && isHmrUpdating) {
            return true;
        }
        if (nextVNode.dirs || nextVNode.transition) {
            return true;
        }
        if (optimized && patchFlag > 0) {
            if (patchFlag & 1024) {
                return true;
            }
            if (patchFlag & 16) {
                if (!prevProps) {
                    return !!nextProps;
                }
                return hasPropsChanged(prevProps, nextProps, emits);
            } else if (patchFlag & 8) {
                const dynamicProps = nextVNode.dynamicProps;
                for(let i = 0; i < dynamicProps.length; i++){
                    const key = dynamicProps[i];
                    if (nextProps[key] !== prevProps[key] && !isEmitListener(emits, key)) {
                        return true;
                    }
                }
            }
        } else {
            if (prevChildren || nextChildren) {
                if (!nextChildren || !nextChildren.$stable) {
                    return true;
                }
            }
            if (prevProps === nextProps) {
                return false;
            }
            if (!prevProps) {
                return !!nextProps;
            }
            if (!nextProps) {
                return true;
            }
            return hasPropsChanged(prevProps, nextProps, emits);
        }
        return false;
    }
    function hasPropsChanged(prevProps, nextProps, emitsOptions) {
        const nextKeys = Object.keys(nextProps);
        if (nextKeys.length !== Object.keys(prevProps).length) {
            return true;
        }
        for(let i = 0; i < nextKeys.length; i++){
            const key = nextKeys[i];
            if (nextProps[key] !== prevProps[key] && !isEmitListener(emitsOptions, key)) {
                return true;
            }
        }
        return false;
    }
    function updateHOCHostEl({ vnode , parent  }, el) {
        while(parent && parent.subTree === vnode){
            (vnode = parent.vnode).el = el;
            parent = parent.parent;
        }
    }
    const isSuspense = (type)=>type.__isSuspense
    ;
    const SuspenseImpl = {
        __isSuspense: true,
        process (n1, n2, container, anchor, parentComponent, parentSuspense, isSVG, optimized, rendererInternals) {
            if (n1 == null) {
                mountSuspense(n2, container, anchor, parentComponent, parentSuspense, isSVG, optimized, rendererInternals);
            } else {
                patchSuspense(n1, n2, container, anchor, parentComponent, isSVG, rendererInternals);
            }
        },
        hydrate: hydrateSuspense,
        create: createSuspenseBoundary
    };
    const Suspense = SuspenseImpl;
    function mountSuspense(vnode, container, anchor, parentComponent, parentSuspense, isSVG, optimized, rendererInternals) {
        const { p: patch , o: { createElement  }  } = rendererInternals;
        const hiddenContainer = createElement('div');
        const suspense = vnode.suspense = createSuspenseBoundary(vnode, parentSuspense, parentComponent, container, hiddenContainer, anchor, isSVG, optimized, rendererInternals);
        patch(null, suspense.pendingBranch = vnode.ssContent, hiddenContainer, null, parentComponent, suspense, isSVG);
        if (suspense.deps > 0) {
            patch(null, vnode.ssFallback, container, anchor, parentComponent, null, isSVG);
            setActiveBranch(suspense, vnode.ssFallback);
        } else {
            suspense.resolve();
        }
    }
    function patchSuspense(n1, n2, container, anchor, parentComponent, isSVG, { p: patch , um: unmount , o: { createElement  }  }) {
        const suspense = n2.suspense = n1.suspense;
        suspense.vnode = n2;
        n2.el = n1.el;
        const newBranch = n2.ssContent;
        const newFallback = n2.ssFallback;
        const { activeBranch , pendingBranch , isInFallback , isHydrating  } = suspense;
        if (pendingBranch) {
            suspense.pendingBranch = newBranch;
            if (isSameVNodeType(newBranch, pendingBranch)) {
                patch(pendingBranch, newBranch, suspense.hiddenContainer, null, parentComponent, suspense, isSVG);
                if (suspense.deps <= 0) {
                    suspense.resolve();
                } else if (isInFallback) {
                    patch(activeBranch, newFallback, container, anchor, parentComponent, null, isSVG);
                    setActiveBranch(suspense, newFallback);
                }
            } else {
                suspense.pendingId++;
                if (isHydrating) {
                    suspense.isHydrating = false;
                    suspense.activeBranch = pendingBranch;
                } else {
                    unmount(pendingBranch, parentComponent, suspense);
                }
                suspense.deps = 0;
                suspense.effects.length = 0;
                suspense.hiddenContainer = createElement('div');
                if (isInFallback) {
                    patch(null, newBranch, suspense.hiddenContainer, null, parentComponent, suspense, isSVG);
                    if (suspense.deps <= 0) {
                        suspense.resolve();
                    } else {
                        patch(activeBranch, newFallback, container, anchor, parentComponent, null, isSVG);
                        setActiveBranch(suspense, newFallback);
                    }
                } else if (activeBranch && isSameVNodeType(newBranch, activeBranch)) {
                    patch(activeBranch, newBranch, container, anchor, parentComponent, suspense, isSVG);
                    suspense.resolve(true);
                } else {
                    patch(null, newBranch, suspense.hiddenContainer, null, parentComponent, suspense, isSVG);
                    if (suspense.deps <= 0) {
                        suspense.resolve();
                    }
                }
            }
        } else {
            if (activeBranch && isSameVNodeType(newBranch, activeBranch)) {
                patch(activeBranch, newBranch, container, anchor, parentComponent, suspense, isSVG);
                setActiveBranch(suspense, newBranch);
            } else {
                const onPending = n2.props && n2.props.onPending;
                if (isFunction(onPending)) {
                    onPending();
                }
                suspense.pendingBranch = newBranch;
                suspense.pendingId++;
                patch(null, newBranch, suspense.hiddenContainer, null, parentComponent, suspense, isSVG);
                if (suspense.deps <= 0) {
                    suspense.resolve();
                } else {
                    const { timeout , pendingId  } = suspense;
                    if (timeout > 0) {
                        setTimeout(()=>{
                            if (suspense.pendingId === pendingId) {
                                suspense.fallback(newFallback);
                            }
                        }, timeout);
                    } else if (timeout === 0) {
                        suspense.fallback(newFallback);
                    }
                }
            }
        }
    }
    let hasWarned = false;
    function createSuspenseBoundary(vnode, parent, parentComponent, container1, hiddenContainer, anchor1, isSVG, optimized, rendererInternals, isHydrating = false) {
        if (!hasWarned) {
            hasWarned = true;
            console[console.info ? 'info' : 'log'](`<Suspense> is an experimental feature and its API will likely change.`);
        }
        const { p: patch , m: move , um: unmount , n: next , o: { parentNode , remove: remove1  }  } = rendererInternals;
        const timeout = toNumber(vnode.props && vnode.props.timeout);
        const suspense = {
            vnode,
            parent,
            parentComponent,
            isSVG,
            container: container1,
            hiddenContainer,
            anchor: anchor1,
            deps: 0,
            pendingId: 0,
            timeout: typeof timeout === 'number' ? timeout : -1,
            activeBranch: null,
            pendingBranch: null,
            isInFallback: true,
            isHydrating,
            isUnmounted: false,
            effects: [],
            resolve (resume = false) {
                {
                    if (!resume && !suspense.pendingBranch) {
                        throw new Error(`suspense.resolve() is called without a pending branch.`);
                    }
                    if (suspense.isUnmounted) {
                        throw new Error(`suspense.resolve() is called on an already unmounted suspense boundary.`);
                    }
                }
                const { vnode: vnode1 , activeBranch , pendingBranch , pendingId , effects , parentComponent: parentComponent1 , container: container1  } = suspense;
                if (suspense.isHydrating) {
                    suspense.isHydrating = false;
                } else if (!resume) {
                    const delayEnter = activeBranch && pendingBranch.transition && pendingBranch.transition.mode === 'out-in';
                    if (delayEnter) {
                        activeBranch.transition.afterLeave = ()=>{
                            if (pendingId === suspense.pendingId) {
                                move(pendingBranch, container1, anchor1, 0);
                            }
                        };
                    }
                    let { anchor: anchor1  } = suspense;
                    if (activeBranch) {
                        anchor1 = next(activeBranch);
                        unmount(activeBranch, parentComponent1, suspense, true);
                    }
                    if (!delayEnter) {
                        move(pendingBranch, container1, anchor1, 0);
                    }
                }
                setActiveBranch(suspense, pendingBranch);
                suspense.pendingBranch = null;
                suspense.isInFallback = false;
                let parent1 = suspense.parent;
                let hasUnresolvedAncestor = false;
                while(parent1){
                    if (parent1.pendingBranch) {
                        parent1.effects.push(...effects);
                        hasUnresolvedAncestor = true;
                        break;
                    }
                    parent1 = parent1.parent;
                }
                if (!hasUnresolvedAncestor) {
                    queuePostFlushCb(effects);
                }
                suspense.effects = [];
                const onResolve = vnode1.props && vnode1.props.onResolve;
                if (isFunction(onResolve)) {
                    onResolve();
                }
            },
            fallback (fallbackVNode) {
                if (!suspense.pendingBranch) {
                    return;
                }
                const { vnode: vnode1 , activeBranch , parentComponent: parentComponent1 , container: container1 , isSVG: isSVG1  } = suspense;
                const onFallback = vnode1.props && vnode1.props.onFallback;
                if (isFunction(onFallback)) {
                    onFallback();
                }
                const anchor1 = next(activeBranch);
                const mountFallback = ()=>{
                    if (!suspense.isInFallback) {
                        return;
                    }
                    patch(null, fallbackVNode, container1, anchor1, parentComponent1, null, isSVG1);
                    setActiveBranch(suspense, fallbackVNode);
                };
                const delayEnter = fallbackVNode.transition && fallbackVNode.transition.mode === 'out-in';
                if (delayEnter) {
                    activeBranch.transition.afterLeave = mountFallback;
                }
                unmount(activeBranch, parentComponent1, null, true);
                suspense.isInFallback = true;
                if (!delayEnter) {
                    mountFallback();
                }
            },
            move (container, anchor, type) {
                suspense.activeBranch && move(suspense.activeBranch, container, anchor, type);
                suspense.container = container;
            },
            next () {
                return suspense.activeBranch && next(suspense.activeBranch);
            },
            registerDep (instance, setupRenderEffect) {
                if (!suspense.pendingBranch) {
                    return;
                }
                const hydratedEl = instance.vnode.el;
                suspense.deps++;
                instance.asyncDep.catch((err)=>{
                    handleError(err, instance, 0);
                }).then((asyncSetupResult)=>{
                    if (instance.isUnmounted || suspense.isUnmounted || suspense.pendingId !== instance.suspenseId) {
                        return;
                    }
                    suspense.deps--;
                    instance.asyncResolved = true;
                    const { vnode: vnode1  } = instance;
                    {
                        pushWarningContext(vnode1);
                    }
                    handleSetupResult(instance, asyncSetupResult);
                    if (hydratedEl) {
                        vnode1.el = hydratedEl;
                    }
                    const placeholder = !hydratedEl && instance.subTree.el;
                    setupRenderEffect(instance, vnode1, parentNode(hydratedEl || instance.subTree.el), hydratedEl ? null : next(instance.subTree), suspense, isSVG, optimized);
                    if (placeholder) {
                        remove1(placeholder);
                    }
                    updateHOCHostEl(instance, vnode1.el);
                    {
                        popWarningContext();
                    }
                    if (suspense.deps === 0) {
                        suspense.resolve();
                    }
                });
            },
            unmount (parentSuspense, doRemove) {
                suspense.isUnmounted = true;
                if (suspense.activeBranch) {
                    unmount(suspense.activeBranch, parentComponent, parentSuspense, doRemove);
                }
                if (suspense.pendingBranch) {
                    unmount(suspense.pendingBranch, parentComponent, parentSuspense, doRemove);
                }
            }
        };
        return suspense;
    }
    function hydrateSuspense(node, vnode, parentComponent, parentSuspense, isSVG, optimized, rendererInternals, hydrateNode) {
        const suspense = vnode.suspense = createSuspenseBoundary(vnode, parentSuspense, parentComponent, node.parentNode, document.createElement('div'), null, isSVG, optimized, rendererInternals, true);
        const result = hydrateNode(node, suspense.pendingBranch = vnode.ssContent, parentComponent, suspense, optimized);
        if (suspense.deps === 0) {
            suspense.resolve();
        }
        return result;
    }
    function normalizeSuspenseChildren(vnode) {
        const { shapeFlag , children  } = vnode;
        let content;
        let fallback;
        if (shapeFlag & 32) {
            content = normalizeSuspenseSlot(children.default);
            fallback = normalizeSuspenseSlot(children.fallback);
        } else {
            content = normalizeSuspenseSlot(children);
            fallback = normalizeVNode(null);
        }
        return {
            content,
            fallback
        };
    }
    function normalizeSuspenseSlot(s) {
        if (isFunction(s)) {
            s = s();
        }
        if (isArray(s)) {
            const singleChild = filterSingleRoot(s);
            if (!singleChild) {
                warn(`<Suspense> slots expect a single root node.`);
            }
            s = singleChild;
        }
        return normalizeVNode(s);
    }
    function queueEffectWithSuspense(fn, suspense) {
        if (suspense && suspense.pendingBranch) {
            if (isArray(fn)) {
                suspense.effects.push(...fn);
            } else {
                suspense.effects.push(fn);
            }
        } else {
            queuePostFlushCb(fn);
        }
    }
    function setActiveBranch(suspense, branch) {
        suspense.activeBranch = branch;
        const { vnode , parentComponent  } = suspense;
        const el = vnode.el = branch.el;
        if (parentComponent && parentComponent.subTree === vnode) {
            parentComponent.vnode.el = el;
            updateHOCHostEl(parentComponent, el);
        }
    }
    let isRenderingCompiledSlot = 0;
    const setCompiledSlotRendering = (n)=>isRenderingCompiledSlot += n
    ;
    function renderSlot(slots, name, props = {
    }, fallback) {
        let slot = slots[name];
        if (slot && slot.length > 1) {
            warn(`SSR-optimized slot function detected in a non-SSR-optimized render ` + `function. You need to mark this component with $dynamic-slots in the ` + `parent template.`);
            slot = ()=>[]
            ;
        }
        isRenderingCompiledSlot++;
        const rendered = (openBlock(), createBlock(Fragment, {
            key: props.key
        }, slot ? slot(props) : fallback ? fallback() : [], slots._ === 1 ? 64 : -2));
        isRenderingCompiledSlot--;
        return rendered;
    }
    function withCtx(fn, ctx = currentRenderingInstance) {
        if (!ctx) return fn;
        const renderFnWithContext = (...args)=>{
            if (!isRenderingCompiledSlot) {
                openBlock(true);
            }
            const owner = currentRenderingInstance;
            setCurrentRenderingInstance(ctx);
            const res = fn(...args);
            setCurrentRenderingInstance(currentRenderingInstance);
            if (!isRenderingCompiledSlot) {
                closeBlock();
            }
            return res;
        };
        renderFnWithContext._c = true;
        return renderFnWithContext;
    }
    let currentScopeId = null;
    const scopeIdStack = [];
    function pushScopeId(id) {
        scopeIdStack.push(currentScopeId = id);
    }
    function popScopeId() {
        scopeIdStack.pop();
        currentScopeId = scopeIdStack[scopeIdStack.length - 1] || null;
    }
    function withScopeId(id) {
        return (fn)=>withCtx(function() {
                pushScopeId(id);
                const res = fn.apply(this, arguments);
                popScopeId();
                return res;
            })
        ;
    }
    function initProps(instance, rawProps, isStateful, isSSR = false) {
        const props = {
        };
        const attrs = {
        };
        def(attrs, InternalObjectKey, 1);
        setFullProps(instance, rawProps, props, attrs);
        {
            validateProps(props, instance);
        }
        if (isStateful) {
            instance.props = isSSR ? props : shallowReactive(props);
        } else {
            if (!instance.type.props) {
                instance.props = attrs;
            } else {
                instance.props = props;
            }
        }
        instance.attrs = attrs;
    }
    function updateProps(instance, rawProps, rawPrevProps, optimized) {
        const { props , attrs , vnode: { patchFlag  }  } = instance;
        const rawCurrentProps = toRaw(props);
        const [options] = instance.propsOptions;
        if (!(instance.type.__hmrId || instance.parent && instance.parent.type.__hmrId) && (optimized || patchFlag > 0) && !(patchFlag & 16)) {
            if (patchFlag & 8) {
                const propsToUpdate = instance.vnode.dynamicProps;
                for(let i = 0; i < propsToUpdate.length; i++){
                    const key = propsToUpdate[i];
                    const value = rawProps[key];
                    if (options) {
                        if (hasOwn(attrs, key)) {
                            attrs[key] = value;
                        } else {
                            const camelizedKey = camelize(key);
                            props[camelizedKey] = resolvePropValue(options, rawCurrentProps, camelizedKey, value, instance);
                        }
                    } else {
                        attrs[key] = value;
                    }
                }
            }
        } else {
            setFullProps(instance, rawProps, props, attrs);
            let kebabKey;
            for(const key in rawCurrentProps){
                if (!rawProps || !hasOwn(rawProps, key) && ((kebabKey = hyphenate(key)) === key || !hasOwn(rawProps, kebabKey))) {
                    if (options) {
                        if (rawPrevProps && (rawPrevProps[key] !== undefined || rawPrevProps[kebabKey] !== undefined)) {
                            props[key] = resolvePropValue(options, rawProps || EMPTY_OBJ, key, undefined, instance);
                        }
                    } else {
                        delete props[key];
                    }
                }
            }
            if (attrs !== rawCurrentProps) {
                for(const key1 in attrs){
                    if (!rawProps || !hasOwn(rawProps, key1)) {
                        delete attrs[key1];
                    }
                }
            }
        }
        trigger(instance, "set", '$attrs');
        if (rawProps) {
            validateProps(props, instance);
        }
    }
    function setFullProps(instance, rawProps, props, attrs) {
        const [options, needCastKeys] = instance.propsOptions;
        if (rawProps) {
            for(const key in rawProps){
                const value = rawProps[key];
                if (isReservedProp(key)) {
                    continue;
                }
                let camelKey;
                if (options && hasOwn(options, camelKey = camelize(key))) {
                    props[camelKey] = value;
                } else if (!isEmitListener(instance.emitsOptions, key)) {
                    attrs[key] = value;
                }
            }
        }
        if (needCastKeys) {
            const rawCurrentProps = toRaw(props);
            for(let i = 0; i < needCastKeys.length; i++){
                const key = needCastKeys[i];
                props[key] = resolvePropValue(options, rawCurrentProps, key, rawCurrentProps[key], instance);
            }
        }
    }
    function resolvePropValue(options, props, key, value, instance) {
        const opt = options[key];
        if (opt != null) {
            const hasDefault = hasOwn(opt, 'default');
            if (hasDefault && value === undefined) {
                const defaultValue = opt.default;
                if (opt.type !== Function && isFunction(defaultValue)) {
                    setCurrentInstance(instance);
                    value = defaultValue(props);
                    setCurrentInstance(null);
                } else {
                    value = defaultValue;
                }
            }
            if (opt[0]) {
                if (!hasOwn(props, key) && !hasDefault) {
                    value = false;
                } else if (opt[1] && (value === '' || value === hyphenate(key))) {
                    value = true;
                }
            }
        }
        return value;
    }
    function normalizePropsOptions(comp, appContext, asMixin = false) {
        if (!appContext.deopt && comp.__props) {
            return comp.__props;
        }
        const raw = comp.props;
        const normalized = {
        };
        const needCastKeys = [];
        let hasExtends = false;
        if (!isFunction(comp)) {
            const extendProps = (raw1)=>{
                hasExtends = true;
                const [props, keys] = normalizePropsOptions(raw1, appContext, true);
                extend(normalized, props);
                if (keys) needCastKeys.push(...keys);
            };
            if (!asMixin && appContext.mixins.length) {
                appContext.mixins.forEach(extendProps);
            }
            if (comp.extends) {
                extendProps(comp.extends);
            }
            if (comp.mixins) {
                comp.mixins.forEach(extendProps);
            }
        }
        if (!raw && !hasExtends) {
            return comp.__props = EMPTY_ARR;
        }
        if (isArray(raw)) {
            for(let i = 0; i < raw.length; i++){
                if (!isString(raw[i])) {
                    warn(`props must be strings when using array syntax.`, raw[i]);
                }
                const normalizedKey = camelize(raw[i]);
                if (validatePropName(normalizedKey)) {
                    normalized[normalizedKey] = EMPTY_OBJ;
                }
            }
        } else if (raw) {
            if (!isObject(raw)) {
                warn(`invalid props options`, raw);
            }
            for(const key in raw){
                const normalizedKey = camelize(key);
                if (validatePropName(normalizedKey)) {
                    const opt = raw[key];
                    const prop = normalized[normalizedKey] = isArray(opt) || isFunction(opt) ? {
                        type: opt
                    } : opt;
                    if (prop) {
                        const booleanIndex = getTypeIndex(Boolean, prop.type);
                        const stringIndex = getTypeIndex(String, prop.type);
                        prop[0] = booleanIndex > -1;
                        prop[1] = stringIndex < 0 || booleanIndex < stringIndex;
                        if (booleanIndex > -1 || hasOwn(prop, 'default')) {
                            needCastKeys.push(normalizedKey);
                        }
                    }
                }
            }
        }
        return comp.__props = [
            normalized,
            needCastKeys
        ];
    }
    function validatePropName(key) {
        if (key[0] !== '$') {
            return true;
        } else {
            warn(`Invalid prop name: "${key}" is a reserved property.`);
        }
        return false;
    }
    function getType(ctor) {
        const match = ctor && ctor.toString().match(/^\s*function (\w+)/);
        return match ? match[1] : '';
    }
    function isSameType(a, b) {
        return getType(a) === getType(b);
    }
    function getTypeIndex(type, expectedTypes) {
        if (isArray(expectedTypes)) {
            for(let i = 0, len = expectedTypes.length; i < len; i++){
                if (isSameType(expectedTypes[i], type)) {
                    return i;
                }
            }
        } else if (isFunction(expectedTypes)) {
            return isSameType(expectedTypes, type) ? 0 : -1;
        }
        return -1;
    }
    function validateProps(props, instance) {
        const rawValues = toRaw(props);
        const options = instance.propsOptions[0];
        for(const key in options){
            let opt = options[key];
            if (opt == null) continue;
            validateProp(key, rawValues[key], opt, !hasOwn(rawValues, key));
        }
    }
    function validateProp(name, value, prop, isAbsent) {
        const { type , required , validator  } = prop;
        if (required && isAbsent) {
            warn('Missing required prop: \"' + name + '\"');
            return;
        }
        if (value == null && !prop.required) {
            return;
        }
        if (type != null && type !== true) {
            let isValid = false;
            const types = isArray(type) ? type : [
                type
            ];
            const expectedTypes = [];
            for(let i = 0; i < types.length && !isValid; i++){
                const { valid , expectedType  } = assertType(value, types[i]);
                expectedTypes.push(expectedType || '');
                isValid = valid;
            }
            if (!isValid) {
                warn(getInvalidTypeMessage(name, value, expectedTypes));
                return;
            }
        }
        if (validator && !validator(value)) {
            warn('Invalid prop: custom validator check failed for prop \"' + name + '\".');
        }
    }
    const isSimpleType = makeMap('String,Number,Boolean,Function,Symbol');
    function assertType(value, type) {
        let valid;
        const expectedType = getType(type);
        if (isSimpleType(expectedType)) {
            const t = typeof value;
            valid = t === expectedType.toLowerCase();
            if (!valid && t === 'object') {
                valid = value instanceof type;
            }
        } else if (expectedType === 'Object') {
            valid = isObject(value);
        } else if (expectedType === 'Array') {
            valid = isArray(value);
        } else {
            valid = value instanceof type;
        }
        return {
            valid,
            expectedType
        };
    }
    function getInvalidTypeMessage(name, value, expectedTypes) {
        let message = `Invalid prop: type check failed for prop "${name}".` + ` Expected ${expectedTypes.map(capitalize).join(', ')}`;
        const expectedType = expectedTypes[0];
        const receivedType = toRawType(value);
        const expectedValue = styleValue(value, expectedType);
        const receivedValue = styleValue(value, receivedType);
        if (expectedTypes.length === 1 && isExplicable(expectedType) && !isBoolean(expectedType, receivedType)) {
            message += ` with value ${expectedValue}`;
        }
        message += `, got ${receivedType} `;
        if (isExplicable(receivedType)) {
            message += `with value ${receivedValue}.`;
        }
        return message;
    }
    function styleValue(value, type) {
        if (type === 'String') {
            return `"${value}"`;
        } else if (type === 'Number') {
            return `${Number(value)}`;
        } else {
            return `${value}`;
        }
    }
    function isExplicable(type) {
        const explicitTypes = [
            'string',
            'number',
            'boolean'
        ];
        return explicitTypes.some((elem)=>type.toLowerCase() === elem
        );
    }
    function isBoolean(...args) {
        return args.some((elem)=>elem.toLowerCase() === 'boolean'
        );
    }
    function injectHook(type, hook, target = currentInstance, prepend = false) {
        if (target) {
            const hooks = target[type] || (target[type] = []);
            const wrappedHook = hook.__weh || (hook.__weh = (...args)=>{
                if (target.isUnmounted) {
                    return;
                }
                pauseTracking();
                setCurrentInstance(target);
                const res = callWithAsyncErrorHandling(hook, target, type, args);
                setCurrentInstance(null);
                resetTracking();
                return res;
            });
            if (prepend) {
                hooks.unshift(wrappedHook);
            } else {
                hooks.push(wrappedHook);
            }
            return wrappedHook;
        } else {
            const apiName = toHandlerKey(ErrorTypeStrings[type].replace(/ hook$/, ''));
            warn(`${apiName} is called when there is no active component instance to be ` + `associated with. ` + `Lifecycle injection APIs can only be used during execution of setup().` + (` If you are using async setup(), make sure to register lifecycle ` + `hooks before the first await statement.`));
        }
    }
    const createHook = (lifecycle)=>(hook, target = currentInstance)=>!isInSSRComponentSetup && injectHook(lifecycle, hook, target)
    ;
    const onBeforeMount = createHook("bm");
    const onMounted = createHook("m");
    const onBeforeUpdate = createHook("bu");
    const onUpdated = createHook("u");
    const onBeforeUnmount = createHook("bum");
    const onUnmounted = createHook("um");
    const onRenderTriggered = createHook("rtg");
    const onRenderTracked = createHook("rtc");
    const onErrorCaptured = (hook, target = currentInstance)=>{
        injectHook("ec", hook, target);
    };
    function watchEffect(effect1, options) {
        return doWatch(effect1, null, options);
    }
    const INITIAL_WATCHER_VALUE = {
    };
    function watch(source, cb, options) {
        if (!isFunction(cb)) {
            warn(`\`watch(fn, options?)\` signature has been moved to a separate API. ` + `Use \`watchEffect(fn, options?)\` instead. \`watch\` now only ` + `supports \`watch(source, cb, options?) signature.`);
        }
        return doWatch(source, cb, options);
    }
    function doWatch(source, cb, { immediate , deep , flush , onTrack , onTrigger  } = EMPTY_OBJ, instance = currentInstance) {
        if (!cb) {
            if (immediate !== undefined) {
                warn(`watch() "immediate" option is only respected when using the ` + `watch(source, callback, options?) signature.`);
            }
            if (deep !== undefined) {
                warn(`watch() "deep" option is only respected when using the ` + `watch(source, callback, options?) signature.`);
            }
        }
        const warnInvalidSource = (s)=>{
            warn(`Invalid watch source: `, s, `A watch source can only be a getter/effect function, a ref, ` + `a reactive object, or an array of these types.`);
        };
        let getter1;
        let forceTrigger = false;
        if (isRef(source)) {
            getter1 = ()=>source.value
            ;
            forceTrigger = !!source._shallow;
        } else if (isReactive(source)) {
            getter1 = ()=>source
            ;
            deep = true;
        } else if (isArray(source)) {
            getter1 = ()=>source.map((s)=>{
                    if (isRef(s)) {
                        return s.value;
                    } else if (isReactive(s)) {
                        return traverse(s);
                    } else if (isFunction(s)) {
                        return callWithErrorHandling(s, instance, 2);
                    } else {
                        warnInvalidSource(s);
                    }
                })
            ;
        } else if (isFunction(source)) {
            if (cb) {
                getter1 = ()=>callWithErrorHandling(source, instance, 2)
                ;
            } else {
                getter1 = ()=>{
                    if (instance && instance.isUnmounted) {
                        return;
                    }
                    if (cleanup2) {
                        cleanup2();
                    }
                    return callWithErrorHandling(source, instance, 3, [
                        onInvalidate
                    ]);
                };
            }
        } else {
            getter1 = NOOP;
            warnInvalidSource(source);
        }
        if (cb && deep) {
            const baseGetter = getter1;
            getter1 = ()=>traverse(getter1())
            ;
        }
        let cleanup2;
        const onInvalidate = (fn)=>{
            cleanup2 = runner.options.onStop = ()=>{
                callWithErrorHandling(fn, instance, 4);
            };
        };
        let oldValue = isArray(source) ? [] : INITIAL_WATCHER_VALUE;
        const job = ()=>{
            if (!runner.active) {
                return;
            }
            if (cb) {
                const newValue = runner();
                if (deep || forceTrigger || hasChanged(newValue, oldValue)) {
                    if (cleanup2) {
                        cleanup2();
                    }
                    callWithAsyncErrorHandling(cb, instance, 3, [
                        newValue,
                        oldValue === INITIAL_WATCHER_VALUE ? undefined : oldValue,
                        onInvalidate
                    ]);
                    oldValue = newValue;
                }
            } else {
                runner();
            }
        };
        job.allowRecurse = !!cb;
        let scheduler;
        if (flush === 'sync') {
            scheduler = job;
        } else if (flush === 'post') {
            scheduler = ()=>queueEffectWithSuspense(job, instance && instance.suspense)
            ;
        } else {
            scheduler = ()=>{
                if (!instance || instance.isMounted) {
                    queuePreFlushCb(job);
                } else {
                    job();
                }
            };
        }
        const runner = effect(getter1, {
            lazy: true,
            onTrack,
            onTrigger,
            scheduler
        });
        recordInstanceBoundEffect(runner);
        if (cb) {
            if (immediate) {
                job();
            } else {
                oldValue = runner();
            }
        } else if (flush === 'post') {
            queueEffectWithSuspense(runner, instance && instance.suspense);
        } else {
            runner();
        }
        return ()=>{
            stop(runner);
            if (instance) {
                remove1(instance.effects, runner);
            }
        };
    }
    function instanceWatch(source, cb, options) {
        const publicThis = this.proxy;
        const getter1 = isString(source) ? ()=>publicThis[source]
         : source.bind(publicThis);
        return doWatch(getter1, cb.bind(publicThis), options, this);
    }
    function traverse(value, seen = new Set()) {
        if (!isObject(value) || seen.has(value)) {
            return value;
        }
        seen.add(value);
        if (isRef(value)) {
            traverse(value.value, seen);
        } else if (isArray(value)) {
            for(let i = 0; i < value.length; i++){
                traverse(value[i], seen);
            }
        } else if (isSet(value) || isMap(value)) {
            value.forEach((v)=>{
                traverse(v, seen);
            });
        } else {
            for(const key in value){
                traverse(value[key], seen);
            }
        }
        return value;
    }
    function useTransitionState() {
        const state = {
            isMounted: false,
            isLeaving: false,
            isUnmounting: false,
            leavingVNodes: new Map()
        };
        onMounted(()=>{
            state.isMounted = true;
        });
        onBeforeUnmount(()=>{
            state.isUnmounting = true;
        });
        return state;
    }
    const TransitionHookValidator = [
        Function,
        Array
    ];
    const BaseTransitionImpl = {
        name: `BaseTransition`,
        props: {
            mode: String,
            appear: Boolean,
            persisted: Boolean,
            onBeforeEnter: TransitionHookValidator,
            onEnter: TransitionHookValidator,
            onAfterEnter: TransitionHookValidator,
            onEnterCancelled: TransitionHookValidator,
            onBeforeLeave: TransitionHookValidator,
            onLeave: TransitionHookValidator,
            onAfterLeave: TransitionHookValidator,
            onLeaveCancelled: TransitionHookValidator,
            onBeforeAppear: TransitionHookValidator,
            onAppear: TransitionHookValidator,
            onAfterAppear: TransitionHookValidator,
            onAppearCancelled: TransitionHookValidator
        },
        setup (props, { slots  }) {
            const instance = getCurrentInstance();
            const state = useTransitionState();
            let prevTransitionKey;
            return ()=>{
                const children = slots.default && getTransitionRawChildren(slots.default(), true);
                if (!children || !children.length) {
                    return;
                }
                if (children.length > 1) {
                    warn('<transition> can only be used on a single element or component. Use ' + '<transition-group> for lists.');
                }
                const rawProps = toRaw(props);
                const { mode  } = rawProps;
                if (mode && ![
                    'in-out',
                    'out-in',
                    'default'
                ].includes(mode)) {
                    warn(`invalid <transition> mode: ${mode}`);
                }
                const child = children[0];
                if (state.isLeaving) {
                    return emptyPlaceholder(child);
                }
                const innerChild = getKeepAliveChild(child);
                if (!innerChild) {
                    return emptyPlaceholder(child);
                }
                const enterHooks = resolveTransitionHooks(innerChild, rawProps, state, instance);
                setTransitionHooks(innerChild, enterHooks);
                const oldChild = instance.subTree;
                const oldInnerChild = oldChild && getKeepAliveChild(oldChild);
                let transitionKeyChanged = false;
                const { getTransitionKey  } = innerChild.type;
                if (getTransitionKey) {
                    const key = getTransitionKey();
                    if (prevTransitionKey === undefined) {
                        prevTransitionKey = key;
                    } else if (key !== prevTransitionKey) {
                        prevTransitionKey = key;
                        transitionKeyChanged = true;
                    }
                }
                if (oldInnerChild && oldInnerChild.type !== Comment1 && (!isSameVNodeType(innerChild, oldInnerChild) || transitionKeyChanged)) {
                    const leavingHooks = resolveTransitionHooks(oldInnerChild, rawProps, state, instance);
                    setTransitionHooks(oldInnerChild, leavingHooks);
                    if (mode === 'out-in') {
                        state.isLeaving = true;
                        leavingHooks.afterLeave = ()=>{
                            state.isLeaving = false;
                            instance.update();
                        };
                        return emptyPlaceholder(child);
                    } else if (mode === 'in-out') {
                        leavingHooks.delayLeave = (el, earlyRemove, delayedLeave)=>{
                            const leavingVNodesCache = getLeavingNodesForType(state, oldInnerChild);
                            leavingVNodesCache[String(oldInnerChild.key)] = oldInnerChild;
                            el._leaveCb = ()=>{
                                earlyRemove();
                                el._leaveCb = undefined;
                                delete enterHooks.delayedLeave;
                            };
                            enterHooks.delayedLeave = delayedLeave;
                        };
                    }
                }
                return child;
            };
        }
    };
    const BaseTransition = BaseTransitionImpl;
    function getLeavingNodesForType(state, vnode) {
        const { leavingVNodes  } = state;
        let leavingVNodesCache = leavingVNodes.get(vnode.type);
        if (!leavingVNodesCache) {
            leavingVNodesCache = Object.create(null);
            leavingVNodes.set(vnode.type, leavingVNodesCache);
        }
        return leavingVNodesCache;
    }
    function resolveTransitionHooks(vnode1, props, state, instance) {
        const { appear , mode , persisted =false , onBeforeEnter , onEnter , onAfterEnter , onEnterCancelled , onBeforeLeave , onLeave , onAfterLeave , onLeaveCancelled , onBeforeAppear , onAppear , onAfterAppear , onAppearCancelled  } = props;
        const key = String(vnode1.key);
        const leavingVNodesCache = getLeavingNodesForType(state, vnode1);
        const callHook = (hook, args)=>{
            hook && callWithAsyncErrorHandling(hook, instance, 9, args);
        };
        const hooks = {
            mode,
            persisted,
            beforeEnter (el) {
                let hook = onBeforeEnter;
                if (!state.isMounted) {
                    if (appear) {
                        hook = onBeforeAppear || onBeforeEnter;
                    } else {
                        return;
                    }
                }
                if (el._leaveCb) {
                    el._leaveCb(true);
                }
                const leavingVNode = leavingVNodesCache[key];
                if (leavingVNode && isSameVNodeType(vnode1, leavingVNode) && leavingVNode.el._leaveCb) {
                    leavingVNode.el._leaveCb();
                }
                callHook(hook, [
                    el
                ]);
            },
            enter (el) {
                let hook = onEnter;
                let afterHook = onAfterEnter;
                let cancelHook = onEnterCancelled;
                if (!state.isMounted) {
                    if (appear) {
                        hook = onAppear || onEnter;
                        afterHook = onAfterAppear || onAfterEnter;
                        cancelHook = onAppearCancelled || onEnterCancelled;
                    } else {
                        return;
                    }
                }
                let called = false;
                const done = el._enterCb = (cancelled)=>{
                    if (called) return;
                    called = true;
                    if (cancelled) {
                        callHook(cancelHook, [
                            el
                        ]);
                    } else {
                        callHook(afterHook, [
                            el
                        ]);
                    }
                    if (hooks.delayedLeave) {
                        hooks.delayedLeave();
                    }
                    el._enterCb = undefined;
                };
                if (hook) {
                    hook(el, done);
                    if (hook.length <= 1) {
                        done();
                    }
                } else {
                    done();
                }
            },
            leave (el, remove) {
                const key1 = String(vnode1.key);
                if (el._enterCb) {
                    el._enterCb(true);
                }
                if (state.isUnmounting) {
                    return remove();
                }
                callHook(onBeforeLeave, [
                    el
                ]);
                let called = false;
                const done = el._leaveCb = (cancelled)=>{
                    if (called) return;
                    called = true;
                    remove();
                    if (cancelled) {
                        callHook(onLeaveCancelled, [
                            el
                        ]);
                    } else {
                        callHook(onAfterLeave, [
                            el
                        ]);
                    }
                    el._leaveCb = undefined;
                    if (leavingVNodesCache[key1] === vnode1) {
                        delete leavingVNodesCache[key1];
                    }
                };
                leavingVNodesCache[key1] = vnode1;
                if (onLeave) {
                    onLeave(el, done);
                    if (onLeave.length <= 1) {
                        done();
                    }
                } else {
                    done();
                }
            },
            clone (vnode) {
                return resolveTransitionHooks(vnode, props, state, instance);
            }
        };
        return hooks;
    }
    function emptyPlaceholder(vnode) {
        if (isKeepAlive(vnode)) {
            vnode = cloneVNode(vnode);
            vnode.children = null;
            return vnode;
        }
    }
    function getKeepAliveChild(vnode) {
        return isKeepAlive(vnode) ? vnode.children ? vnode.children[0] : undefined : vnode;
    }
    function setTransitionHooks(vnode, hooks) {
        if (vnode.shapeFlag & 6 && vnode.component) {
            setTransitionHooks(vnode.component.subTree, hooks);
        } else if (vnode.shapeFlag & 128) {
            vnode.ssContent.transition = hooks.clone(vnode.ssContent);
            vnode.ssFallback.transition = hooks.clone(vnode.ssFallback);
        } else {
            vnode.transition = hooks;
        }
    }
    function getTransitionRawChildren(children, keepComment = false) {
        let ret = [];
        let keyedFragmentCount = 0;
        for(let i = 0; i < children.length; i++){
            const child = children[i];
            if (child.type === Fragment) {
                if (child.patchFlag & 128) keyedFragmentCount++;
                ret = ret.concat(getTransitionRawChildren(child.children, keepComment));
            } else if (keepComment || child.type !== Comment1) {
                ret.push(child);
            }
        }
        if (keyedFragmentCount > 1) {
            for(let i1 = 0; i1 < ret.length; i1++){
                ret[i1].patchFlag = -2;
            }
        }
        return ret;
    }
    const isKeepAlive = (vnode)=>vnode.type.__isKeepAlive
    ;
    const KeepAliveImpl = {
        name: `KeepAlive`,
        __isKeepAlive: true,
        inheritRef: true,
        props: {
            include: [
                String,
                RegExp,
                Array
            ],
            exclude: [
                String,
                RegExp,
                Array
            ],
            max: [
                String,
                Number
            ]
        },
        setup (props, { slots  }) {
            const cache = new Map();
            const keys = new Set();
            let current = null;
            const instance = getCurrentInstance();
            const parentSuspense = instance.suspense;
            const sharedContext = instance.ctx;
            const { renderer: { p: patch , m: move , um: _unmount , o: { createElement  }  }  } = sharedContext;
            const storageContainer = createElement('div');
            sharedContext.activate = (vnode, container, anchor, isSVG, optimized)=>{
                const instance1 = vnode.component;
                move(vnode, container, anchor, 0, parentSuspense);
                patch(instance1.vnode, vnode, container, anchor, instance1, parentSuspense, isSVG, optimized);
                queueEffectWithSuspense(()=>{
                    instance1.isDeactivated = false;
                    if (instance1.a) {
                        invokeArrayFns(instance1.a);
                    }
                    const vnodeHook = vnode.props && vnode.props.onVnodeMounted;
                    if (vnodeHook) {
                        invokeVNodeHook(vnodeHook, instance1.parent, vnode);
                    }
                }, parentSuspense);
            };
            sharedContext.deactivate = (vnode)=>{
                const instance1 = vnode.component;
                move(vnode, storageContainer, null, 1, parentSuspense);
                queueEffectWithSuspense(()=>{
                    if (instance1.da) {
                        invokeArrayFns(instance1.da);
                    }
                    const vnodeHook = vnode.props && vnode.props.onVnodeUnmounted;
                    if (vnodeHook) {
                        invokeVNodeHook(vnodeHook, instance1.parent, vnode);
                    }
                    instance1.isDeactivated = true;
                }, parentSuspense);
            };
            function unmount(vnode) {
                resetShapeFlag(vnode);
                _unmount(vnode, instance, parentSuspense);
            }
            function pruneCache(filter) {
                cache.forEach((vnode, key)=>{
                    const name = getName(vnode.type);
                    if (name && (!filter || !filter(name))) {
                        pruneCacheEntry(key);
                    }
                });
            }
            function pruneCacheEntry(key) {
                const cached = cache.get(key);
                if (!current || cached.type !== current.type) {
                    unmount(cached);
                } else if (current) {
                    resetShapeFlag(current);
                }
                cache.delete(key);
                keys.delete(key);
            }
            watch(()=>[
                    props.include,
                    props.exclude
                ]
            , ([include, exclude])=>{
                include && pruneCache((name)=>matches(include, name)
                );
                exclude && pruneCache((name)=>!matches(exclude, name)
                );
            }, {
                flush: 'post'
            });
            let pendingCacheKey = null;
            const cacheSubtree = ()=>{
                if (pendingCacheKey != null) {
                    cache.set(pendingCacheKey, getInnerChild(instance.subTree));
                }
            };
            onMounted(cacheSubtree);
            onUpdated(cacheSubtree);
            onBeforeUnmount(()=>{
                cache.forEach((cached)=>{
                    const { subTree , suspense  } = instance;
                    const vnode = getInnerChild(subTree);
                    if (cached.type === vnode.type) {
                        resetShapeFlag(vnode);
                        const da = vnode.component.da;
                        da && queueEffectWithSuspense(da, suspense);
                        return;
                    }
                    unmount(cached);
                });
            });
            return ()=>{
                pendingCacheKey = null;
                if (!slots.default) {
                    return null;
                }
                const children = slots.default();
                const rawVNode = children[0];
                if (children.length > 1) {
                    {
                        warn(`KeepAlive should contain exactly one component child.`);
                    }
                    current = null;
                    return children;
                } else if (!isVNode1(rawVNode) || !(rawVNode.shapeFlag & 4) && !(rawVNode.shapeFlag & 128)) {
                    current = null;
                    return rawVNode;
                }
                let vnode = getInnerChild(rawVNode);
                const comp = vnode.type;
                const name = getName(comp);
                const { include , exclude , max  } = props;
                if (include && (!name || !matches(include, name)) || exclude && name && matches(exclude, name)) {
                    current = vnode;
                    return rawVNode;
                }
                const key = vnode.key == null ? comp : vnode.key;
                const cachedVNode = cache.get(key);
                if (vnode.el) {
                    vnode = cloneVNode(vnode);
                    if (rawVNode.shapeFlag & 128) {
                        rawVNode.ssContent = vnode;
                    }
                }
                pendingCacheKey = key;
                if (cachedVNode) {
                    vnode.el = cachedVNode.el;
                    vnode.component = cachedVNode.component;
                    if (vnode.transition) {
                        setTransitionHooks(vnode, vnode.transition);
                    }
                    vnode.shapeFlag |= 512;
                    keys.delete(key);
                    keys.add(key);
                } else {
                    keys.add(key);
                    if (max && keys.size > parseInt(max, 10)) {
                        pruneCacheEntry(keys.values().next().value);
                    }
                }
                vnode.shapeFlag |= 256;
                current = vnode;
                return rawVNode;
            };
        }
    };
    const KeepAlive = KeepAliveImpl;
    function getName(comp) {
        return comp.displayName || comp.name;
    }
    function matches(pattern, name) {
        if (isArray(pattern)) {
            return pattern.some((p)=>matches(p, name)
            );
        } else if (isString(pattern)) {
            return pattern.split(',').indexOf(name) > -1;
        } else if (pattern.test) {
            return pattern.test(name);
        }
        return false;
    }
    function onActivated(hook, target) {
        registerKeepAliveHook(hook, "a", target);
    }
    function onDeactivated(hook, target) {
        registerKeepAliveHook(hook, "da", target);
    }
    function registerKeepAliveHook(hook, type, target = currentInstance) {
        const wrappedHook = hook.__wdc || (hook.__wdc = ()=>{
            let current = target;
            while(current){
                if (current.isDeactivated) {
                    return;
                }
                current = current.parent;
            }
            hook();
        });
        injectHook(type, wrappedHook, target);
        if (target) {
            let current = target.parent;
            while(current && current.parent){
                if (isKeepAlive(current.parent.vnode)) {
                    injectToKeepAliveRoot(wrappedHook, type, target, current);
                }
                current = current.parent;
            }
        }
    }
    function injectToKeepAliveRoot(hook, type, target, keepAliveRoot) {
        const injected = injectHook(type, hook, keepAliveRoot, true);
        onUnmounted(()=>{
            remove1(keepAliveRoot[type], injected);
        }, target);
    }
    function resetShapeFlag(vnode) {
        let shapeFlag = vnode.shapeFlag;
        if (shapeFlag & 256) {
            shapeFlag -= 256;
        }
        if (shapeFlag & 512) {
            shapeFlag -= 512;
        }
        vnode.shapeFlag = shapeFlag;
    }
    function getInnerChild(vnode) {
        return vnode.shapeFlag & 128 ? vnode.ssContent : vnode;
    }
    const isInternalKey = (key)=>key[0] === '_' || key === '$stable'
    ;
    const normalizeSlotValue = (value)=>isArray(value) ? value.map(normalizeVNode) : [
            normalizeVNode(value)
        ]
    ;
    const normalizeSlot = (key, rawSlot, ctx)=>withCtx((props)=>{
            if (currentInstance) {
                warn(`Slot "${key}" invoked outside of the render function: ` + `this will not track dependencies used in the slot. ` + `Invoke the slot function inside the render function instead.`);
            }
            return normalizeSlotValue(rawSlot(props));
        }, ctx)
    ;
    const normalizeObjectSlots = (rawSlots, slots)=>{
        const ctx = rawSlots._ctx;
        for(const key in rawSlots){
            if (isInternalKey(key)) continue;
            const value = rawSlots[key];
            if (isFunction(value)) {
                slots[key] = normalizeSlot(key, value, ctx);
            } else if (value != null) {
                {
                    warn(`Non-function value encountered for slot "${key}". ` + `Prefer function slots for better performance.`);
                }
                const normalized = normalizeSlotValue(value);
                slots[key] = ()=>normalized
                ;
            }
        }
    };
    const normalizeVNodeSlots = (instance, children)=>{
        if (!isKeepAlive(instance.vnode)) {
            warn(`Non-function value encountered for default slot. ` + `Prefer function slots for better performance.`);
        }
        const normalized = normalizeSlotValue(children);
        instance.slots.default = ()=>normalized
        ;
    };
    const initSlots = (instance, children)=>{
        if (instance.vnode.shapeFlag & 32) {
            const type = children._;
            if (type) {
                instance.slots = children;
                def(children, '_', type);
            } else {
                normalizeObjectSlots(children, instance.slots = {
                });
            }
        } else {
            instance.slots = {
            };
            if (children) {
                normalizeVNodeSlots(instance, children);
            }
        }
        def(instance.slots, InternalObjectKey, 1);
    };
    const updateSlots = (instance, children)=>{
        const { vnode , slots  } = instance;
        let needDeletionCheck = true;
        let deletionComparisonTarget = EMPTY_OBJ;
        if (vnode.shapeFlag & 32) {
            const type = children._;
            if (type) {
                if (isHmrUpdating) {
                    extend(slots, children);
                } else if (type === 1) {
                    needDeletionCheck = false;
                } else {
                    extend(slots, children);
                }
            } else {
                needDeletionCheck = !children.$stable;
                normalizeObjectSlots(children, slots);
            }
            deletionComparisonTarget = children;
        } else if (children) {
            normalizeVNodeSlots(instance, children);
            deletionComparisonTarget = {
                default: 1
            };
        }
        if (needDeletionCheck) {
            for(const key in slots){
                if (!isInternalKey(key) && !(key in deletionComparisonTarget)) {
                    delete slots[key];
                }
            }
        }
    };
    const isBuiltInDirective = makeMap('bind,cloak,else-if,else,for,html,if,model,on,once,pre,show,slot,text');
    function validateDirectiveName(name) {
        if (isBuiltInDirective(name)) {
            warn('Do not use built-in directive ids as custom directive id: ' + name);
        }
    }
    function withDirectives(vnode, directives) {
        const internalInstance = currentRenderingInstance;
        if (currentRenderingInstance === null) {
            warn(`withDirectives can only be used inside render functions.`);
            return vnode;
        }
        const instance = currentRenderingInstance.proxy;
        const bindings = vnode.dirs || (vnode.dirs = []);
        for(let i = 0; i < directives.length; i++){
            let [dir, value, arg, modifiers = EMPTY_OBJ] = directives[i];
            if (isFunction(dir)) {
                dir = {
                    mounted: dir,
                    updated: dir
                };
            }
            bindings.push({
                dir,
                instance,
                value,
                oldValue: void 0,
                arg,
                modifiers
            });
        }
        return vnode;
    }
    function invokeDirectiveHook(vnode, prevVNode, instance, name) {
        const bindings = vnode.dirs;
        const oldBindings = prevVNode && prevVNode.dirs;
        for(let i = 0; i < bindings.length; i++){
            const binding = bindings[i];
            if (oldBindings) {
                binding.oldValue = oldBindings[i].value;
            }
            const hook = binding.dir[name];
            if (hook) {
                callWithAsyncErrorHandling(hook, instance, 8, [
                    vnode.el,
                    binding,
                    vnode,
                    prevVNode
                ]);
            }
        }
    }
    function createAppContext() {
        return {
            app: null,
            config: {
                isNativeTag: NO,
                performance: false,
                globalProperties: {
                },
                optionMergeStrategies: {
                },
                isCustomElement: NO,
                errorHandler: undefined,
                warnHandler: undefined
            },
            mixins: [],
            components: {
            },
            directives: {
            },
            provides: Object.create(null)
        };
    }
    let uid$1 = 0;
    function createAppAPI(render, hydrate) {
        return function createApp(rootComponent, rootProps = null) {
            if (rootProps != null && !isObject(rootProps)) {
                warn(`root props passed to app.mount() must be an object.`);
                rootProps = null;
            }
            const context = createAppContext();
            const installedPlugins = new Set();
            let isMounted = false;
            const app = context.app = {
                _uid: uid$1++,
                _component: rootComponent,
                _props: rootProps,
                _container: null,
                _context: context,
                version,
                get config () {
                    return context.config;
                },
                set config (v){
                    {
                        warn(`app.config cannot be replaced. Modify individual options instead.`);
                    }
                },
                use (plugin, ...options) {
                    if (installedPlugins.has(plugin)) {
                        warn(`Plugin has already been applied to target app.`);
                    } else if (plugin && isFunction(plugin.install)) {
                        installedPlugins.add(plugin);
                        plugin.install(app, ...options);
                    } else if (isFunction(plugin)) {
                        installedPlugins.add(plugin);
                        plugin(app, ...options);
                    } else {
                        warn(`A plugin must either be a function or an object with an "install" ` + `function.`);
                    }
                    return app;
                },
                mixin (mixin) {
                    {
                        if (!context.mixins.includes(mixin)) {
                            context.mixins.push(mixin);
                            if (mixin.props || mixin.emits) {
                                context.deopt = true;
                            }
                        } else {
                            warn('Mixin has already been applied to target app' + (mixin.name ? `: ${mixin.name}` : ''));
                        }
                    }
                    return app;
                },
                component (name, component) {
                    {
                        validateComponentName(name, context.config);
                    }
                    if (!component) {
                        return context.components[name];
                    }
                    if (context.components[name]) {
                        warn(`Component "${name}" has already been registered in target app.`);
                    }
                    context.components[name] = component;
                    return app;
                },
                directive (name, directive) {
                    {
                        validateDirectiveName(name);
                    }
                    if (!directive) {
                        return context.directives[name];
                    }
                    if (context.directives[name]) {
                        warn(`Directive "${name}" has already been registered in target app.`);
                    }
                    context.directives[name] = directive;
                    return app;
                },
                mount (rootContainer, isHydrate) {
                    if (!isMounted) {
                        const vnode = createVNodeWithArgsTransform(rootComponent, rootProps);
                        vnode.appContext = context;
                        {
                            context.reload = ()=>{
                                render(cloneVNode(vnode), rootContainer);
                            };
                        }
                        if (isHydrate && hydrate) {
                            hydrate(vnode, rootContainer);
                        } else {
                            render(vnode, rootContainer);
                        }
                        isMounted = true;
                        app._container = rootContainer;
                        rootContainer.__vue_app__ = app;
                        {
                            devtoolsInitApp(app, "3.0.2");
                        }
                        return vnode.component.proxy;
                    } else {
                        warn(`App has already been mounted.\n` + `If you want to remount the same app, move your app creation logic ` + `into a factory function and create fresh app instances for each ` + `mount - e.g. \`const createMyApp = () => createApp(App)\``);
                    }
                },
                unmount () {
                    if (isMounted) {
                        render(null, app._container);
                        {
                            devtoolsUnmountApp(app);
                        }
                    } else {
                        warn(`Cannot unmount an app that is not mounted.`);
                    }
                },
                provide (key, value) {
                    if (key in context.provides) {
                        warn(`App already provides property with key "${String(key)}". ` + `It will be overwritten with the new value.`);
                    }
                    context.provides[key] = value;
                    return app;
                }
            };
            return app;
        };
    }
    let hasMismatch = false;
    const isSVGContainer = (container)=>/svg/.test(container.namespaceURI) && container.tagName !== 'foreignObject'
    ;
    const isComment = (node)=>node.nodeType === 8
    ;
    function createHydrationFunctions(rendererInternals) {
        const { mt: mountComponent , p: patch , o: { patchProp , nextSibling , parentNode , remove: remove2 , insert , createComment  }  } = rendererInternals;
        const hydrate = (vnode, container)=>{
            if (!container.hasChildNodes()) {
                warn(`Attempting to hydrate existing markup but container is empty. ` + `Performing full mount instead.`);
                patch(null, vnode, container);
                return;
            }
            hasMismatch = false;
            hydrateNode(container.firstChild, vnode, null, null);
            flushPostFlushCbs();
            if (hasMismatch && !false) {
                console.error(`Hydration completed but contains mismatches.`);
            }
        };
        const hydrateNode = (node, vnode, parentComponent, parentSuspense, optimized = false)=>{
            const isFragmentStart = isComment(node) && node.data === '[';
            const onMismatch = ()=>handleMismatch(node, vnode, parentComponent, parentSuspense, isFragmentStart)
            ;
            const { type , ref: ref1 , shapeFlag  } = vnode;
            const domType = node.nodeType;
            vnode.el = node;
            let nextNode = null;
            switch(type){
                case Text1:
                    if (domType !== 3) {
                        nextNode = onMismatch();
                    } else {
                        if (node.data !== vnode.children) {
                            hasMismatch = true;
                            warn(`Hydration text mismatch:` + `\n- Client: ${JSON.stringify(node.data)}` + `\n- Server: ${JSON.stringify(vnode.children)}`);
                            node.data = vnode.children;
                        }
                        nextNode = nextSibling(node);
                    }
                    break;
                case Comment1:
                    if (domType !== 8 || isFragmentStart) {
                        nextNode = onMismatch();
                    } else {
                        nextNode = nextSibling(node);
                    }
                    break;
                case Static:
                    if (domType !== 1) {
                        nextNode = onMismatch();
                    } else {
                        nextNode = node;
                        const needToAdoptContent = !vnode.children.length;
                        for(let i = 0; i < vnode.staticCount; i++){
                            if (needToAdoptContent) vnode.children += nextNode.outerHTML;
                            if (i === vnode.staticCount - 1) {
                                vnode.anchor = nextNode;
                            }
                            nextNode = nextSibling(nextNode);
                        }
                        return nextNode;
                    }
                    break;
                case Fragment:
                    if (!isFragmentStart) {
                        nextNode = onMismatch();
                    } else {
                        nextNode = hydrateFragment(node, vnode, parentComponent, parentSuspense, optimized);
                    }
                    break;
                default:
                    if (shapeFlag & 1) {
                        if (domType !== 1 || vnode.type !== node.tagName.toLowerCase()) {
                            nextNode = onMismatch();
                        } else {
                            nextNode = hydrateElement(node, vnode, parentComponent, parentSuspense, optimized);
                        }
                    } else if (shapeFlag & 6) {
                        const container = parentNode(node);
                        const hydrateComponent = ()=>{
                            mountComponent(vnode, container, null, parentComponent, parentSuspense, isSVGContainer(container), optimized);
                        };
                        const loadAsync = vnode.type.__asyncLoader;
                        if (loadAsync) {
                            loadAsync().then(hydrateComponent);
                        } else {
                            hydrateComponent();
                        }
                        nextNode = isFragmentStart ? locateClosingAsyncAnchor(node) : nextSibling(node);
                    } else if (shapeFlag & 64) {
                        if (domType !== 8) {
                            nextNode = onMismatch();
                        } else {
                            nextNode = vnode.type.hydrate(node, vnode, parentComponent, parentSuspense, optimized, rendererInternals, hydrateChildren);
                        }
                    } else if (shapeFlag & 128) {
                        nextNode = vnode.type.hydrate(node, vnode, parentComponent, parentSuspense, isSVGContainer(parentNode(node)), optimized, rendererInternals, hydrateNode);
                    } else {
                        warn('Invalid HostVNode type:', type, `(${typeof type})`);
                    }
            }
            if (ref1 != null && parentComponent) {
                setRef(ref1, null, parentComponent, parentSuspense, vnode);
            }
            return nextNode;
        };
        const hydrateElement = (el, vnode, parentComponent, parentSuspense, optimized)=>{
            optimized = optimized || !!vnode.dynamicChildren;
            const { props , patchFlag , shapeFlag , dirs  } = vnode;
            if (patchFlag !== -1) {
                if (dirs) {
                    invokeDirectiveHook(vnode, null, parentComponent, 'created');
                }
                if (props) {
                    if (!optimized || (patchFlag & 16 || patchFlag & 32)) {
                        for(const key in props){
                            if (!isReservedProp(key) && isOn(key)) {
                                patchProp(el, key, null, props[key]);
                            }
                        }
                    } else if (props.onClick) {
                        patchProp(el, 'onClick', null, props.onClick);
                    }
                }
                let vnodeHooks;
                if (vnodeHooks = props && props.onVnodeBeforeMount) {
                    invokeVNodeHook(vnodeHooks, parentComponent, vnode);
                }
                if (dirs) {
                    invokeDirectiveHook(vnode, null, parentComponent, 'beforeMount');
                }
                if ((vnodeHooks = props && props.onVnodeMounted) || dirs) {
                    queueEffectWithSuspense(()=>{
                        vnodeHooks && invokeVNodeHook(vnodeHooks, parentComponent, vnode);
                        dirs && invokeDirectiveHook(vnode, null, parentComponent, 'mounted');
                    }, parentSuspense);
                }
                if (shapeFlag & 16 && !(props && (props.innerHTML || props.textContent))) {
                    let next = hydrateChildren(el.firstChild, vnode, el, parentComponent, parentSuspense, optimized);
                    let hasWarned1 = false;
                    while(next){
                        hasMismatch = true;
                        if (!hasWarned1) {
                            warn(`Hydration children mismatch in <${vnode.type}>: ` + `server rendered element contains more child nodes than client vdom.`);
                            hasWarned1 = true;
                        }
                        const cur = next;
                        next = next.nextSibling;
                        remove2(next);
                    }
                } else if (shapeFlag & 8) {
                    if (el.textContent !== vnode.children) {
                        hasMismatch = true;
                        warn(`Hydration text content mismatch in <${vnode.type}>:\n` + `- Client: ${el.textContent}\n` + `- Server: ${vnode.children}`);
                        el.textContent = vnode.children;
                    }
                }
            }
            return el.nextSibling;
        };
        const hydrateChildren = (node, parentVNode, container, parentComponent, parentSuspense, optimized)=>{
            optimized = optimized || !!parentVNode.dynamicChildren;
            const children = parentVNode.children;
            const l = children.length;
            let hasWarned1 = false;
            for(let i = 0; i < l; i++){
                const vnode = optimized ? children[i] : children[i] = normalizeVNode(children[i]);
                if (node) {
                    node = hydrateNode(node, vnode, parentComponent, parentSuspense, optimized);
                } else {
                    hasMismatch = true;
                    if (!hasWarned1) {
                        warn(`Hydration children mismatch in <${container.tagName.toLowerCase()}>: ` + `server rendered element contains fewer child nodes than client vdom.`);
                        hasWarned1 = true;
                    }
                    patch(null, vnode, container, null, parentComponent, parentSuspense, isSVGContainer(container));
                }
            }
            return node;
        };
        const hydrateFragment = (node, vnode, parentComponent, parentSuspense, optimized)=>{
            const container = parentNode(node);
            const next = hydrateChildren(nextSibling(node), vnode, container, parentComponent, parentSuspense, optimized);
            if (next && isComment(next) && next.data === ']') {
                return nextSibling(vnode.anchor = next);
            } else {
                hasMismatch = true;
                insert(vnode.anchor = createComment(`]`), container, next);
                return next;
            }
        };
        const handleMismatch = (node, vnode, parentComponent, parentSuspense, isFragment)=>{
            hasMismatch = true;
            warn(`Hydration node mismatch:\n- Client vnode:`, vnode.type, `\n- Server rendered DOM:`, node, node.nodeType === 3 ? `(text)` : isComment(node) && node.data === '[' ? `(start of fragment)` : ``);
            vnode.el = null;
            if (isFragment) {
                const end = locateClosingAsyncAnchor(node);
                while(true){
                    const next = nextSibling(node);
                    if (next && next !== end) {
                        remove2(next);
                    } else {
                        break;
                    }
                }
            }
            const next = nextSibling(node);
            const container = parentNode(node);
            remove2(node);
            patch(null, vnode, container, next, parentComponent, parentSuspense, isSVGContainer(container));
            return next;
        };
        const locateClosingAsyncAnchor = (node)=>{
            let match = 0;
            while(node){
                node = nextSibling(node);
                if (node && isComment(node)) {
                    if (node.data === '[') match++;
                    if (node.data === ']') {
                        if (match === 0) {
                            return nextSibling(node);
                        } else {
                            match--;
                        }
                    }
                }
            }
            return node;
        };
        return [
            hydrate,
            hydrateNode
        ];
    }
    let supported;
    let perf;
    function startMeasure(instance, type) {
        if (instance.appContext.config.performance && isSupported()) {
            perf.mark(`vue-${type}-${instance.uid}`);
        }
    }
    function endMeasure(instance, type) {
        if (instance.appContext.config.performance && isSupported()) {
            const startTag = `vue-${type}-${instance.uid}`;
            const endTag = startTag + `:end`;
            perf.mark(endTag);
            perf.measure(`<${formatComponentName(instance, instance.type)}> ${type}`, startTag, endTag);
            perf.clearMarks(startTag);
            perf.clearMarks(endTag);
        }
    }
    function isSupported() {
        if (supported !== undefined) {
            return supported;
        }
        if (typeof window !== 'undefined' && window.performance) {
            supported = true;
            perf = window.performance;
        } else {
            supported = false;
        }
        return supported;
    }
    function createDevEffectOptions(instance) {
        return {
            scheduler: queueJob,
            allowRecurse: true,
            onTrack: instance.rtc ? (e)=>invokeArrayFns(instance.rtc, e)
             : void 0,
            onTrigger: instance.rtg ? (e)=>invokeArrayFns(instance.rtg, e)
             : void 0
        };
    }
    const queuePostRenderEffect = queueEffectWithSuspense;
    const setRef = (rawRef, oldRawRef, parentComponent, parentSuspense, vnode)=>{
        if (isArray(rawRef)) {
            rawRef.forEach((r, i)=>setRef(r, oldRawRef && (isArray(oldRawRef) ? oldRawRef[i] : oldRawRef), parentComponent, parentSuspense, vnode)
            );
            return;
        }
        let value;
        if (!vnode) {
            value = null;
        } else {
            if (vnode.shapeFlag & 4) {
                value = vnode.component.proxy;
            } else {
                value = vnode.el;
            }
        }
        const { i: owner , r: ref1  } = rawRef;
        if (!owner) {
            warn(`Missing ref owner context. ref cannot be used on hoisted vnodes. ` + `A vnode with ref must be created inside the render function.`);
            return;
        }
        const oldRef = oldRawRef && oldRawRef.r;
        const refs = owner.refs === EMPTY_OBJ ? owner.refs = {
        } : owner.refs;
        const setupState = owner.setupState;
        if (oldRef != null && oldRef !== ref1) {
            if (isString(oldRef)) {
                refs[oldRef] = null;
                if (hasOwn(setupState, oldRef)) {
                    setupState[oldRef] = null;
                }
            } else if (isRef(oldRef)) {
                oldRef.value = null;
            }
        }
        if (isString(ref1)) {
            const doSet = ()=>{
                refs[ref1] = value;
                if (hasOwn(setupState, ref1)) {
                    setupState[ref1] = value;
                }
            };
            if (value) {
                doSet.id = -1;
                queueEffectWithSuspense(doSet, parentSuspense);
            } else {
                doSet();
            }
        } else if (isRef(ref1)) {
            const doSet = ()=>{
                ref1.value = value;
            };
            if (value) {
                doSet.id = -1;
                queueEffectWithSuspense(doSet, parentSuspense);
            } else {
                doSet();
            }
        } else if (isFunction(ref1)) {
            callWithErrorHandling(ref1, parentComponent, 12, [
                value,
                refs
            ]);
        } else {
            warn('Invalid template ref type:', value, `(${typeof value})`);
        }
    };
    function createRenderer(options) {
        return baseCreateRenderer(options);
    }
    function createHydrationRenderer(options) {
        return baseCreateRenderer(options, createHydrationFunctions);
    }
    function baseCreateRenderer(options, createHydrationFns) {
        const { insert: hostInsert , remove: hostRemove , patchProp: hostPatchProp , forcePatchProp: hostForcePatchProp , createElement: hostCreateElement , createText: hostCreateText , createComment: hostCreateComment , setText: hostSetText , setElementText: hostSetElementText , parentNode: hostParentNode , nextSibling: hostNextSibling , setScopeId: hostSetScopeId = NOOP , cloneNode: hostCloneNode , insertStaticContent: hostInsertStaticContent  } = options;
        const patch = (n1, n2, container, anchor = null, parentComponent = null, parentSuspense = null, isSVG = false, optimized = false)=>{
            if (n1 && !isSameVNodeType(n1, n2)) {
                anchor = getNextHostNode(n1);
                unmount(n1, parentComponent, parentSuspense, true);
                n1 = null;
            }
            if (n2.patchFlag === -2) {
                optimized = false;
                n2.dynamicChildren = null;
            }
            const { type , ref: ref1 , shapeFlag  } = n2;
            switch(type){
                case Text1:
                    processText(n1, n2, container, anchor);
                    break;
                case Comment1:
                    processCommentNode(n1, n2, container, anchor);
                    break;
                case Static:
                    if (n1 == null) {
                        mountStaticNode(n2, container, anchor, isSVG);
                    } else {
                        patchStaticNode(n1, n2, container, isSVG);
                    }
                    break;
                case Fragment:
                    processFragment(n1, n2, container, anchor, parentComponent, parentSuspense, isSVG, optimized);
                    break;
                default:
                    if (shapeFlag & 1) {
                        processElement(n1, n2, container, anchor, parentComponent, parentSuspense, isSVG, optimized);
                    } else if (shapeFlag & 6) {
                        processComponent(n1, n2, container, anchor, parentComponent, parentSuspense, isSVG, optimized);
                    } else if (shapeFlag & 64) {
                        type.process(n1, n2, container, anchor, parentComponent, parentSuspense, isSVG, optimized, internals);
                    } else if (shapeFlag & 128) {
                        type.process(n1, n2, container, anchor, parentComponent, parentSuspense, isSVG, optimized, internals);
                    } else {
                        warn('Invalid VNode type:', type, `(${typeof type})`);
                    }
            }
            if (ref1 != null && parentComponent) {
                setRef(ref1, n1 && n1.ref, parentComponent, parentSuspense, n2);
            }
        };
        const processText = (n1, n2, container, anchor)=>{
            if (n1 == null) {
                hostInsert(n2.el = hostCreateText(n2.children), container, anchor);
            } else {
                const el = n2.el = n1.el;
                if (n2.children !== n1.children) {
                    hostSetText(el, n2.children);
                }
            }
        };
        const processCommentNode = (n1, n2, container, anchor)=>{
            if (n1 == null) {
                hostInsert(n2.el = hostCreateComment(n2.children || ''), container, anchor);
            } else {
                n2.el = n1.el;
            }
        };
        const mountStaticNode = (n2, container, anchor, isSVG)=>{
            [n2.el, n2.anchor] = hostInsertStaticContent(n2.children, container, anchor, isSVG);
        };
        const patchStaticNode = (n1, n2, container, isSVG)=>{
            if (n2.children !== n1.children) {
                const anchor = hostNextSibling(n1.anchor);
                removeStaticNode(n1);
                [n2.el, n2.anchor] = hostInsertStaticContent(n2.children, container, anchor, isSVG);
            } else {
                n2.el = n1.el;
                n2.anchor = n1.anchor;
            }
        };
        const moveStaticNode = (vnode, container, anchor)=>{
            let cur = vnode.el;
            const end = vnode.anchor;
            while(cur && cur !== end){
                const next = hostNextSibling(cur);
                hostInsert(cur, container, anchor);
                cur = next;
            }
            hostInsert(end, container, anchor);
        };
        const removeStaticNode = (vnode)=>{
            let cur = vnode.el;
            while(cur && cur !== vnode.anchor){
                const next = hostNextSibling(cur);
                hostRemove(cur);
                cur = next;
            }
            hostRemove(vnode.anchor);
        };
        const processElement = (n1, n2, container, anchor, parentComponent, parentSuspense, isSVG, optimized)=>{
            isSVG = isSVG || n2.type === 'svg';
            if (n1 == null) {
                mountElement(n2, container, anchor, parentComponent, parentSuspense, isSVG, optimized);
            } else {
                patchElement(n1, n2, parentComponent, parentSuspense, isSVG, optimized);
            }
        };
        const mountElement = (vnode, container, anchor, parentComponent, parentSuspense, isSVG, optimized)=>{
            let el;
            let vnodeHook;
            const { type , props , shapeFlag , transition , scopeId , patchFlag , dirs  } = vnode;
            {
                el = vnode.el = hostCreateElement(vnode.type, isSVG, props && props.is);
                if (shapeFlag & 8) {
                    hostSetElementText(el, vnode.children);
                } else if (shapeFlag & 16) {
                    mountChildren(vnode.children, el, null, parentComponent, parentSuspense, isSVG && type !== 'foreignObject', optimized || !!vnode.dynamicChildren);
                }
                if (dirs) {
                    invokeDirectiveHook(vnode, null, parentComponent, 'created');
                }
                if (props) {
                    for(const key in props){
                        if (!isReservedProp(key)) {
                            hostPatchProp(el, key, null, props[key], isSVG, vnode.children, parentComponent, parentSuspense, unmountChildren);
                        }
                    }
                    if (vnodeHook = props.onVnodeBeforeMount) {
                        invokeVNodeHook(vnodeHook, parentComponent, vnode);
                    }
                }
                setScopeId(el, scopeId, vnode, parentComponent);
            }
            {
                Object.defineProperty(el, '__vnode', {
                    value: vnode,
                    enumerable: false
                });
                Object.defineProperty(el, '__vueParentComponent', {
                    value: parentComponent,
                    enumerable: false
                });
            }
            if (dirs) {
                invokeDirectiveHook(vnode, null, parentComponent, 'beforeMount');
            }
            const needCallTransitionHooks = (!parentSuspense || parentSuspense && !parentSuspense.pendingBranch) && transition && !transition.persisted;
            if (needCallTransitionHooks) {
                transition.beforeEnter(el);
            }
            hostInsert(el, container, anchor);
            if ((vnodeHook = props && props.onVnodeMounted) || needCallTransitionHooks || dirs) {
                queueEffectWithSuspense(()=>{
                    vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, vnode);
                    needCallTransitionHooks && transition.enter(el);
                    dirs && invokeDirectiveHook(vnode, null, parentComponent, 'mounted');
                }, parentSuspense);
            }
        };
        const setScopeId = (el, scopeId, vnode, parentComponent)=>{
            if (scopeId) {
                hostSetScopeId(el, scopeId);
            }
            if (parentComponent) {
                const treeOwnerId = parentComponent.type.__scopeId;
                if (treeOwnerId && treeOwnerId !== scopeId) {
                    hostSetScopeId(el, treeOwnerId + '-s');
                }
                let subTree = parentComponent.subTree;
                if (subTree.type === Fragment) {
                    subTree = filterSingleRoot(subTree.children) || subTree;
                }
                if (vnode === subTree) {
                    setScopeId(el, parentComponent.vnode.scopeId, parentComponent.vnode, parentComponent.parent);
                }
            }
        };
        const mountChildren = (children, container, anchor, parentComponent, parentSuspense, isSVG, optimized, start = 0)=>{
            for(let i = start; i < children.length; i++){
                const child = children[i] = optimized ? cloneIfMounted(children[i]) : normalizeVNode(children[i]);
                patch(null, child, container, anchor, parentComponent, parentSuspense, isSVG, optimized);
            }
        };
        const patchElement = (n1, n2, parentComponent, parentSuspense, isSVG, optimized)=>{
            const el = n2.el = n1.el;
            let { patchFlag , dynamicChildren , dirs  } = n2;
            patchFlag |= n1.patchFlag & 16;
            const oldProps = n1.props || EMPTY_OBJ;
            const newProps = n2.props || EMPTY_OBJ;
            let vnodeHook;
            if (vnodeHook = newProps.onVnodeBeforeUpdate) {
                invokeVNodeHook(vnodeHook, parentComponent, n2, n1);
            }
            if (dirs) {
                invokeDirectiveHook(n2, n1, parentComponent, 'beforeUpdate');
            }
            if (isHmrUpdating) {
                patchFlag = 0;
                optimized = false;
                dynamicChildren = null;
            }
            if (patchFlag > 0) {
                if (patchFlag & 16) {
                    patchProps(el, n2, oldProps, newProps, parentComponent, parentSuspense, isSVG);
                } else {
                    if (patchFlag & 2) {
                        if (oldProps.class !== newProps.class) {
                            hostPatchProp(el, 'class', null, newProps.class, isSVG);
                        }
                    }
                    if (patchFlag & 4) {
                        hostPatchProp(el, 'style', oldProps.style, newProps.style, isSVG);
                    }
                    if (patchFlag & 8) {
                        const propsToUpdate = n2.dynamicProps;
                        for(let i = 0; i < propsToUpdate.length; i++){
                            const key = propsToUpdate[i];
                            const prev = oldProps[key];
                            const next = newProps[key];
                            if (next !== prev || hostForcePatchProp && hostForcePatchProp(el, key)) {
                                hostPatchProp(el, key, prev, next, isSVG, n1.children, parentComponent, parentSuspense, unmountChildren);
                            }
                        }
                    }
                }
                if (patchFlag & 1) {
                    if (n1.children !== n2.children) {
                        hostSetElementText(el, n2.children);
                    }
                }
            } else if (!optimized && dynamicChildren == null) {
                patchProps(el, n2, oldProps, newProps, parentComponent, parentSuspense, isSVG);
            }
            const areChildrenSVG = isSVG && n2.type !== 'foreignObject';
            if (dynamicChildren) {
                patchBlockChildren(n1.dynamicChildren, dynamicChildren, el, parentComponent, parentSuspense, areChildrenSVG);
                if (parentComponent && parentComponent.type.__hmrId) {
                    traverseStaticChildren(n1, n2);
                }
            } else if (!optimized) {
                patchChildren(n1, n2, el, null, parentComponent, parentSuspense, areChildrenSVG);
            }
            if ((vnodeHook = newProps.onVnodeUpdated) || dirs) {
                queueEffectWithSuspense(()=>{
                    vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, n2, n1);
                    dirs && invokeDirectiveHook(n2, n1, parentComponent, 'updated');
                }, parentSuspense);
            }
        };
        const patchBlockChildren = (oldChildren, newChildren, fallbackContainer, parentComponent, parentSuspense, isSVG)=>{
            for(let i = 0; i < newChildren.length; i++){
                const oldVNode = oldChildren[i];
                const newVNode = newChildren[i];
                const container = oldVNode.type === Fragment || !isSameVNodeType(oldVNode, newVNode) || oldVNode.shapeFlag & 6 || oldVNode.shapeFlag & 64 ? hostParentNode(oldVNode.el) : fallbackContainer;
                patch(oldVNode, newVNode, container, null, parentComponent, parentSuspense, isSVG, true);
            }
        };
        const patchProps = (el, vnode, oldProps, newProps, parentComponent, parentSuspense, isSVG)=>{
            if (oldProps !== newProps) {
                for(const key in newProps){
                    if (isReservedProp(key)) continue;
                    const next = newProps[key];
                    const prev = oldProps[key];
                    if (next !== prev || hostForcePatchProp && hostForcePatchProp(el, key)) {
                        hostPatchProp(el, key, prev, next, isSVG, vnode.children, parentComponent, parentSuspense, unmountChildren);
                    }
                }
                if (oldProps !== EMPTY_OBJ) {
                    for(const key1 in oldProps){
                        if (!isReservedProp(key1) && !(key1 in newProps)) {
                            hostPatchProp(el, key1, oldProps[key1], null, isSVG, vnode.children, parentComponent, parentSuspense, unmountChildren);
                        }
                    }
                }
            }
        };
        const processFragment = (n1, n2, container, anchor, parentComponent, parentSuspense, isSVG, optimized)=>{
            const fragmentStartAnchor = n2.el = n1 ? n1.el : hostCreateText('');
            const fragmentEndAnchor = n2.anchor = n1 ? n1.anchor : hostCreateText('');
            let { patchFlag , dynamicChildren  } = n2;
            if (patchFlag > 0) {
                optimized = true;
            }
            if (isHmrUpdating) {
                patchFlag = 0;
                optimized = false;
                dynamicChildren = null;
            }
            if (n1 == null) {
                hostInsert(fragmentStartAnchor, container, anchor);
                hostInsert(fragmentEndAnchor, container, anchor);
                mountChildren(n2.children, container, fragmentEndAnchor, parentComponent, parentSuspense, isSVG, optimized);
            } else {
                if (patchFlag > 0 && patchFlag & 64 && dynamicChildren) {
                    patchBlockChildren(n1.dynamicChildren, dynamicChildren, container, parentComponent, parentSuspense, isSVG);
                    if (parentComponent && parentComponent.type.__hmrId) {
                        traverseStaticChildren(n1, n2);
                    } else if (n2.key != null || parentComponent && n2 === parentComponent.subTree) {
                        traverseStaticChildren(n1, n2, true);
                    }
                } else {
                    patchChildren(n1, n2, container, fragmentEndAnchor, parentComponent, parentSuspense, isSVG, optimized);
                }
            }
        };
        const processComponent = (n1, n2, container, anchor, parentComponent, parentSuspense, isSVG, optimized)=>{
            if (n1 == null) {
                if (n2.shapeFlag & 512) {
                    parentComponent.ctx.activate(n2, container, anchor, isSVG, optimized);
                } else {
                    mountComponent(n2, container, anchor, parentComponent, parentSuspense, isSVG, optimized);
                }
            } else {
                updateComponent(n1, n2, optimized);
            }
        };
        const mountComponent = (initialVNode, container, anchor, parentComponent, parentSuspense, isSVG, optimized)=>{
            const instance = initialVNode.component = createComponentInstance(initialVNode, parentComponent, parentSuspense);
            if (instance.type.__hmrId) {
                registerHMR(instance);
            }
            {
                pushWarningContext(initialVNode);
                startMeasure(instance, `mount`);
            }
            if (isKeepAlive(initialVNode)) {
                instance.ctx.renderer = internals;
            }
            {
                startMeasure(instance, `init`);
            }
            setupComponent(instance);
            {
                endMeasure(instance, `init`);
            }
            if (instance.asyncDep) {
                parentSuspense && parentSuspense.registerDep(instance, setupRenderEffect);
                if (!initialVNode.el) {
                    const placeholder = instance.subTree = createVNodeWithArgsTransform(Comment1);
                    processCommentNode(null, placeholder, container, anchor);
                }
                return;
            }
            setupRenderEffect(instance, initialVNode, container, anchor, parentSuspense, isSVG, optimized);
            {
                popWarningContext();
                endMeasure(instance, `mount`);
            }
        };
        const updateComponent = (n1, n2, optimized)=>{
            const instance = n2.component = n1.component;
            if (shouldUpdateComponent(n1, n2, optimized)) {
                if (instance.asyncDep && !instance.asyncResolved) {
                    {
                        pushWarningContext(n2);
                    }
                    updateComponentPreRender(instance, n2, optimized);
                    {
                        popWarningContext();
                    }
                    return;
                } else {
                    instance.next = n2;
                    invalidateJob(instance.update);
                    instance.update();
                }
            } else {
                n2.component = n1.component;
                n2.el = n1.el;
                instance.vnode = n2;
            }
        };
        const setupRenderEffect = (instance, initialVNode, container, anchor, parentSuspense, isSVG, optimized)=>{
            instance.update = effect(function componentEffect() {
                if (!instance.isMounted) {
                    let vnodeHook;
                    const { el , props  } = initialVNode;
                    const { bm , m , parent  } = instance;
                    if (bm) {
                        invokeArrayFns(bm);
                    }
                    if (vnodeHook = props && props.onVnodeBeforeMount) {
                        invokeVNodeHook(vnodeHook, parent, initialVNode);
                    }
                    {
                        startMeasure(instance, `render`);
                    }
                    const subTree = instance.subTree = renderComponentRoot(instance);
                    {
                        endMeasure(instance, `render`);
                    }
                    if (el && hydrateNode) {
                        {
                            startMeasure(instance, `hydrate`);
                        }
                        hydrateNode(initialVNode.el, subTree, instance, parentSuspense);
                        {
                            endMeasure(instance, `hydrate`);
                        }
                    } else {
                        {
                            startMeasure(instance, `patch`);
                        }
                        patch(null, subTree, container, anchor, instance, parentSuspense, isSVG);
                        {
                            endMeasure(instance, `patch`);
                        }
                        initialVNode.el = subTree.el;
                    }
                    if (m) {
                        queueEffectWithSuspense(m, parentSuspense);
                    }
                    if (vnodeHook = props && props.onVnodeMounted) {
                        queueEffectWithSuspense(()=>{
                            invokeVNodeHook(vnodeHook, parent, initialVNode);
                        }, parentSuspense);
                    }
                    const { a  } = instance;
                    if (a && initialVNode.shapeFlag & 256) {
                        queueEffectWithSuspense(a, parentSuspense);
                    }
                    instance.isMounted = true;
                } else {
                    let { next , bu , u , parent , vnode  } = instance;
                    let originNext = next;
                    let vnodeHook;
                    {
                        pushWarningContext(next || instance.vnode);
                    }
                    if (next) {
                        next.el = vnode.el;
                        updateComponentPreRender(instance, next, optimized);
                    } else {
                        next = vnode;
                    }
                    if (bu) {
                        invokeArrayFns(bu);
                    }
                    if (vnodeHook = next.props && next.props.onVnodeBeforeUpdate) {
                        invokeVNodeHook(vnodeHook, parent, next, vnode);
                    }
                    {
                        startMeasure(instance, `render`);
                    }
                    const nextTree = renderComponentRoot(instance);
                    {
                        endMeasure(instance, `render`);
                    }
                    const prevTree = instance.subTree;
                    instance.subTree = nextTree;
                    {
                        startMeasure(instance, `patch`);
                    }
                    patch(prevTree, nextTree, hostParentNode(prevTree.el), getNextHostNode(prevTree), instance, parentSuspense, isSVG);
                    {
                        endMeasure(instance, `patch`);
                    }
                    next.el = nextTree.el;
                    if (originNext === null) {
                        updateHOCHostEl(instance, nextTree.el);
                    }
                    if (u) {
                        queueEffectWithSuspense(u, parentSuspense);
                    }
                    if (vnodeHook = next.props && next.props.onVnodeUpdated) {
                        queueEffectWithSuspense(()=>{
                            invokeVNodeHook(vnodeHook, parent, next, vnode);
                        }, parentSuspense);
                    }
                    {
                        devtoolsComponentUpdated(instance);
                    }
                    {
                        popWarningContext();
                    }
                }
            }, createDevEffectOptions(instance));
        };
        const updateComponentPreRender = (instance, nextVNode, optimized)=>{
            nextVNode.component = instance;
            const prevProps = instance.vnode.props;
            instance.vnode = nextVNode;
            instance.next = null;
            updateProps(instance, nextVNode.props, prevProps, optimized);
            updateSlots(instance, nextVNode.children);
            flushPreFlushCbs(undefined, instance.update);
        };
        const patchChildren = (n1, n2, container, anchor, parentComponent, parentSuspense, isSVG, optimized = false)=>{
            const c1 = n1 && n1.children;
            const prevShapeFlag = n1 ? n1.shapeFlag : 0;
            const c2 = n2.children;
            const { patchFlag , shapeFlag  } = n2;
            if (patchFlag > 0) {
                if (patchFlag & 128) {
                    patchKeyedChildren(c1, c2, container, anchor, parentComponent, parentSuspense, isSVG, optimized);
                    return;
                } else if (patchFlag & 256) {
                    patchUnkeyedChildren(c1, c2, container, anchor, parentComponent, parentSuspense, isSVG, optimized);
                    return;
                }
            }
            if (shapeFlag & 8) {
                if (prevShapeFlag & 16) {
                    unmountChildren(c1, parentComponent, parentSuspense);
                }
                if (c2 !== c1) {
                    hostSetElementText(container, c2);
                }
            } else {
                if (prevShapeFlag & 16) {
                    if (shapeFlag & 16) {
                        patchKeyedChildren(c1, c2, container, anchor, parentComponent, parentSuspense, isSVG, optimized);
                    } else {
                        unmountChildren(c1, parentComponent, parentSuspense, true);
                    }
                } else {
                    if (prevShapeFlag & 8) {
                        hostSetElementText(container, '');
                    }
                    if (shapeFlag & 16) {
                        mountChildren(c2, container, anchor, parentComponent, parentSuspense, isSVG, optimized);
                    }
                }
            }
        };
        const patchUnkeyedChildren = (c1, c2, container, anchor, parentComponent, parentSuspense, isSVG, optimized)=>{
            c1 = c1 || EMPTY_ARR;
            c2 = c2 || EMPTY_ARR;
            const oldLength = c1.length;
            const newLength = c2.length;
            const commonLength = Math.min(oldLength, newLength);
            let i;
            for(i = 0; i < commonLength; i++){
                const nextChild = c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]);
                patch(c1[i], nextChild, container, null, parentComponent, parentSuspense, isSVG, optimized);
            }
            if (oldLength > newLength) {
                unmountChildren(c1, parentComponent, parentSuspense, true, false, commonLength);
            } else {
                mountChildren(c2, container, anchor, parentComponent, parentSuspense, isSVG, optimized, commonLength);
            }
        };
        const patchKeyedChildren = (c1, c2, container, parentAnchor, parentComponent, parentSuspense, isSVG, optimized)=>{
            let i = 0;
            const l2 = c2.length;
            let e1 = c1.length - 1;
            let e2 = l2 - 1;
            while(i <= e1 && i <= e2){
                const n1 = c1[i];
                const n2 = c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]);
                if (isSameVNodeType(n1, n2)) {
                    patch(n1, n2, container, null, parentComponent, parentSuspense, isSVG, optimized);
                } else {
                    break;
                }
                i++;
            }
            while(i <= e1 && i <= e2){
                const n1 = c1[e1];
                const n2 = c2[e2] = optimized ? cloneIfMounted(c2[e2]) : normalizeVNode(c2[e2]);
                if (isSameVNodeType(n1, n2)) {
                    patch(n1, n2, container, null, parentComponent, parentSuspense, isSVG, optimized);
                } else {
                    break;
                }
                e1--;
                e2--;
            }
            if (i > e1) {
                if (i <= e2) {
                    const nextPos = e2 + 1;
                    const anchor = nextPos < l2 ? c2[nextPos].el : parentAnchor;
                    while(i <= e2){
                        patch(null, c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]), container, anchor, parentComponent, parentSuspense, isSVG);
                        i++;
                    }
                }
            } else if (i > e2) {
                while(i <= e1){
                    unmount(c1[i], parentComponent, parentSuspense, true);
                    i++;
                }
            } else {
                const s1 = i;
                const s2 = i;
                const keyToNewIndexMap = new Map();
                for(i = i; i <= e2; i++){
                    const nextChild = c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]);
                    if (nextChild.key != null) {
                        if (keyToNewIndexMap.has(nextChild.key)) {
                            warn(`Duplicate keys found during update:`, JSON.stringify(nextChild.key), `Make sure keys are unique.`);
                        }
                        keyToNewIndexMap.set(nextChild.key, i);
                    }
                }
                let j;
                let patched = 0;
                const toBePatched = e2 - i + 1;
                let moved = false;
                let maxNewIndexSoFar = 0;
                const newIndexToOldIndexMap = new Array(toBePatched);
                for(i = 0; i < toBePatched; i++)newIndexToOldIndexMap[i] = 0;
                for(i = i; i <= e1; i++){
                    const prevChild = c1[i];
                    if (patched >= toBePatched) {
                        unmount(prevChild, parentComponent, parentSuspense, true);
                        continue;
                    }
                    let newIndex;
                    if (prevChild.key != null) {
                        newIndex = keyToNewIndexMap.get(prevChild.key);
                    } else {
                        for(j = i; j <= e2; j++){
                            if (newIndexToOldIndexMap[j - i] === 0 && isSameVNodeType(prevChild, c2[j])) {
                                newIndex = j;
                                break;
                            }
                        }
                    }
                    if (newIndex === undefined) {
                        unmount(prevChild, parentComponent, parentSuspense, true);
                    } else {
                        newIndexToOldIndexMap[newIndex - s2] = i + 1;
                        if (newIndex >= maxNewIndexSoFar) {
                            maxNewIndexSoFar = newIndex;
                        } else {
                            moved = true;
                        }
                        patch(prevChild, c2[newIndex], container, null, parentComponent, parentSuspense, isSVG, optimized);
                        patched++;
                    }
                }
                const increasingNewIndexSequence = moved ? getSequence(newIndexToOldIndexMap) : EMPTY_ARR;
                j = increasingNewIndexSequence.length - 1;
                for(i = toBePatched - 1; i >= 0; i--){
                    const nextIndex = i + i;
                    const nextChild = c2[nextIndex];
                    const anchor = nextIndex + 1 < l2 ? c2[nextIndex + 1].el : parentAnchor;
                    if (newIndexToOldIndexMap[i] === 0) {
                        patch(null, nextChild, container, anchor, parentComponent, parentSuspense, isSVG);
                    } else if (moved) {
                        if (j < 0 || i !== increasingNewIndexSequence[j]) {
                            move(nextChild, container, anchor, 2);
                        } else {
                            j--;
                        }
                    }
                }
            }
        };
        const move = (vnode, container, anchor, moveType, parentSuspense = null)=>{
            const { el , type , transition , children , shapeFlag  } = vnode;
            if (shapeFlag & 6) {
                move(vnode.component.subTree, container, anchor, moveType);
                return;
            }
            if (shapeFlag & 128) {
                vnode.suspense.move(container, anchor, moveType);
                return;
            }
            if (shapeFlag & 64) {
                type.move(vnode, container, anchor, internals);
                return;
            }
            if (type === Fragment) {
                hostInsert(el, container, anchor);
                for(let i = 0; i < children.length; i++){
                    move(children[i], container, anchor, moveType);
                }
                hostInsert(vnode.anchor, container, anchor);
                return;
            }
            if (type === Static) {
                moveStaticNode(vnode, container, anchor);
                return;
            }
            const needTransition = moveType !== 2 && shapeFlag & 1 && transition;
            if (needTransition) {
                if (moveType === 0) {
                    transition.beforeEnter(el);
                    hostInsert(el, container, anchor);
                    queueEffectWithSuspense(()=>transition.enter(el)
                    , parentSuspense);
                } else {
                    const { leave , delayLeave , afterLeave  } = transition;
                    const remove2 = ()=>hostInsert(el, container, anchor)
                    ;
                    const performLeave = ()=>{
                        leave(el, ()=>{
                            remove2();
                            afterLeave && afterLeave();
                        });
                    };
                    if (delayLeave) {
                        delayLeave(el, remove2, performLeave);
                    } else {
                        performLeave();
                    }
                }
            } else {
                hostInsert(el, container, anchor);
            }
        };
        const unmount = (vnode, parentComponent, parentSuspense, doRemove = false, optimized = false)=>{
            const { type , props , ref: ref1 , children , dynamicChildren , shapeFlag , patchFlag , dirs  } = vnode;
            if (ref1 != null && parentComponent) {
                setRef(ref1, null, parentComponent, parentSuspense, null);
            }
            if (shapeFlag & 256) {
                parentComponent.ctx.deactivate(vnode);
                return;
            }
            const shouldInvokeDirs = shapeFlag & 1 && dirs;
            let vnodeHook;
            if (vnodeHook = props && props.onVnodeBeforeUnmount) {
                invokeVNodeHook(vnodeHook, parentComponent, vnode);
            }
            if (shapeFlag & 6) {
                unmountComponent(vnode.component, parentSuspense, doRemove);
            } else {
                if (shapeFlag & 128) {
                    vnode.suspense.unmount(parentSuspense, doRemove);
                    return;
                }
                if (shouldInvokeDirs) {
                    invokeDirectiveHook(vnode, null, parentComponent, 'beforeUnmount');
                }
                if (dynamicChildren && (type !== Fragment || patchFlag > 0 && patchFlag & 64)) {
                    unmountChildren(dynamicChildren, parentComponent, parentSuspense, false, true);
                } else if (type === Fragment && (patchFlag & 128 || patchFlag & 256) || !optimized && shapeFlag & 16) {
                    unmountChildren(children, parentComponent, parentSuspense);
                }
                if (shapeFlag & 64 && (doRemove || !isTeleportDisabled(vnode.props))) {
                    vnode.type.remove(vnode, internals);
                }
                if (doRemove) {
                    remove2(vnode);
                }
            }
            if ((vnodeHook = props && props.onVnodeUnmounted) || shouldInvokeDirs) {
                queueEffectWithSuspense(()=>{
                    vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, vnode);
                    shouldInvokeDirs && invokeDirectiveHook(vnode, null, parentComponent, 'unmounted');
                }, parentSuspense);
            }
        };
        const remove2 = (vnode)=>{
            const { type , el , anchor , transition  } = vnode;
            if (type === Fragment) {
                removeFragment(el, anchor);
                return;
            }
            if (type === Static) {
                removeStaticNode(vnode);
                return;
            }
            const performRemove = ()=>{
                hostRemove(el);
                if (transition && !transition.persisted && transition.afterLeave) {
                    transition.afterLeave();
                }
            };
            if (vnode.shapeFlag & 1 && transition && !transition.persisted) {
                const { leave , delayLeave  } = transition;
                const performLeave = ()=>leave(el, performRemove)
                ;
                if (delayLeave) {
                    delayLeave(vnode.el, performRemove, performLeave);
                } else {
                    performLeave();
                }
            } else {
                performRemove();
            }
        };
        const removeFragment = (cur, end)=>{
            let next;
            while(cur !== end){
                next = hostNextSibling(cur);
                hostRemove(cur);
                cur = next;
            }
            hostRemove(end);
        };
        const unmountComponent = (instance, parentSuspense, doRemove)=>{
            if (instance.type.__hmrId) {
                unregisterHMR(instance);
            }
            const { bum , effects , update , subTree , um  } = instance;
            if (bum) {
                invokeArrayFns(bum);
            }
            if (effects) {
                for(let i = 0; i < effects.length; i++){
                    stop(effects[i]);
                }
            }
            if (update) {
                stop(update);
                unmount(subTree, instance, parentSuspense, doRemove);
            }
            if (um) {
                queueEffectWithSuspense(um, parentSuspense);
            }
            queueEffectWithSuspense(()=>{
                instance.isUnmounted = true;
            }, parentSuspense);
            if (parentSuspense && parentSuspense.pendingBranch && !parentSuspense.isUnmounted && instance.asyncDep && !instance.asyncResolved && instance.suspenseId === parentSuspense.pendingId) {
                parentSuspense.deps--;
                if (parentSuspense.deps === 0) {
                    parentSuspense.resolve();
                }
            }
            {
                devtoolsComponentRemoved(instance);
            }
        };
        const unmountChildren = (children, parentComponent, parentSuspense, doRemove = false, optimized = false, start = 0)=>{
            for(let i = start; i < children.length; i++){
                unmount(children[i], parentComponent, parentSuspense, doRemove, optimized);
            }
        };
        const getNextHostNode = (vnode)=>{
            if (vnode.shapeFlag & 6) {
                return getNextHostNode(vnode.component.subTree);
            }
            if (vnode.shapeFlag & 128) {
                return vnode.suspense.next();
            }
            return hostNextSibling(vnode.anchor || vnode.el);
        };
        const render = (vnode, container)=>{
            if (vnode == null) {
                if (container._vnode) {
                    unmount(container._vnode, null, null, true);
                }
            } else {
                patch(container._vnode || null, vnode, container);
            }
            flushPostFlushCbs();
            container._vnode = vnode;
        };
        const internals = {
            p: patch,
            um: unmount,
            m: move,
            r: remove2,
            mt: mountComponent,
            mc: mountChildren,
            pc: patchChildren,
            pbc: patchBlockChildren,
            n: getNextHostNode,
            o: options
        };
        let hydrate;
        let hydrateNode;
        if (createHydrationFns) {
            [hydrate, hydrateNode] = createHydrationFns(internals);
        }
        return {
            render,
            hydrate,
            createApp: createAppAPI(render, hydrate)
        };
    }
    function invokeVNodeHook(hook, instance, vnode, prevVNode = null) {
        callWithAsyncErrorHandling(hook, instance, 7, [
            vnode,
            prevVNode
        ]);
    }
    function traverseStaticChildren(n1, n2, shallow = false) {
        const ch1 = n1.children;
        const ch2 = n2.children;
        if (isArray(ch1) && isArray(ch2)) {
            for(let i = 0; i < ch1.length; i++){
                const c1 = ch1[i];
                let c2 = ch2[i];
                if (c2.shapeFlag & 1 && !c2.dynamicChildren) {
                    if (c2.patchFlag <= 0 || c2.patchFlag === 32) {
                        c2 = ch2[i] = cloneIfMounted(ch2[i]);
                        c2.el = c1.el;
                    }
                    if (!shallow) traverseStaticChildren(c1, c2);
                }
                if (c2.type === Comment1 && !c2.el) {
                    c2.el = c1.el;
                }
            }
        }
    }
    function getSequence(arr) {
        const p = arr.slice();
        const result = [
            0
        ];
        let i, j, u, v, c;
        const len = arr.length;
        for(i = 0; i < len; i++){
            const arrI = arr[i];
            if (arrI !== 0) {
                j = result[result.length - 1];
                if (arr[j] < arrI) {
                    p[i] = j;
                    result.push(i);
                    continue;
                }
                u = 0;
                v = result.length - 1;
                while(u < v){
                    c = (u + v) / 2 | 0;
                    if (arr[result[c]] < arrI) {
                        u = c + 1;
                    } else {
                        v = c;
                    }
                }
                if (arrI < arr[result[u]]) {
                    if (u > 0) {
                        p[i] = result[u - 1];
                    }
                    result[u] = i;
                }
            }
        }
        u = result.length;
        v = result[u - 1];
        while((u--) > 0){
            result[u] = v;
            v = p[v];
        }
        return result;
    }
    const isTeleport = (type)=>type.__isTeleport
    ;
    const isTeleportDisabled = (props)=>props && (props.disabled || props.disabled === '')
    ;
    const resolveTarget = (props, select)=>{
        const targetSelector = props && props.to;
        if (isString(targetSelector)) {
            if (!select) {
                warn(`Current renderer does not support string target for Teleports. ` + `(missing querySelector renderer option)`);
                return null;
            } else {
                const target = select(targetSelector);
                if (!target) {
                    warn(`Failed to locate Teleport target with selector "${targetSelector}". ` + `Note the target element must exist before the component is mounted - ` + `i.e. the target cannot be rendered by the component itself, and ` + `ideally should be outside of the entire Vue component tree.`);
                }
                return target;
            }
        } else {
            if (!targetSelector && !isTeleportDisabled(props)) {
                warn(`Invalid Teleport target: ${targetSelector}`);
            }
            return targetSelector;
        }
    };
    const TeleportImpl = {
        __isTeleport: true,
        process (n1, n2, container, anchor, parentComponent, parentSuspense, isSVG, optimized, internals) {
            const { mc: mountChildren , pc: patchChildren , pbc: patchBlockChildren , o: { insert , querySelector , createText , createComment  }  } = internals;
            const disabled = isTeleportDisabled(n2.props);
            const { shapeFlag , children  } = n2;
            if (n1 == null) {
                const placeholder = n2.el = createComment('teleport start');
                const mainAnchor = n2.anchor = createComment('teleport end');
                insert(placeholder, container, anchor);
                insert(mainAnchor, container, anchor);
                const target = n2.target = resolveTarget(n2.props, querySelector);
                const targetAnchor = n2.targetAnchor = createText('');
                if (target) {
                    insert(targetAnchor, target);
                } else if (!disabled) {
                    warn('Invalid Teleport target on mount:', target, `(${typeof target})`);
                }
                const mount = (container, anchor)=>{
                    if (shapeFlag & 16) {
                        mountChildren(children, container, anchor, parentComponent, parentSuspense, isSVG, optimized);
                    }
                };
                if (disabled) {
                    mount(container, mainAnchor);
                } else if (target) {
                    mount(target, targetAnchor);
                }
            } else {
                n2.el = n1.el;
                const mainAnchor = n2.anchor = n1.anchor;
                const target = n2.target = n1.target;
                const targetAnchor = n2.targetAnchor = n1.targetAnchor;
                const wasDisabled = isTeleportDisabled(n1.props);
                const currentContainer = wasDisabled ? container : target;
                const currentAnchor = wasDisabled ? mainAnchor : targetAnchor;
                if (n2.dynamicChildren) {
                    patchBlockChildren(n1.dynamicChildren, n2.dynamicChildren, currentContainer, parentComponent, parentSuspense, isSVG);
                    traverseStaticChildren(n1, n2, true);
                } else if (!optimized) {
                    patchChildren(n1, n2, currentContainer, currentAnchor, parentComponent, parentSuspense, isSVG);
                }
                if (disabled) {
                    if (!wasDisabled) {
                        moveTeleport(n2, container, mainAnchor, internals, 1);
                    }
                } else {
                    if ((n2.props && n2.props.to) !== (n1.props && n1.props.to)) {
                        const nextTarget = n2.target = resolveTarget(n2.props, querySelector);
                        if (nextTarget) {
                            moveTeleport(n2, nextTarget, null, internals, 0);
                        } else {
                            warn('Invalid Teleport target on update:', target, `(${typeof target})`);
                        }
                    } else if (wasDisabled) {
                        moveTeleport(n2, target, targetAnchor, internals, 1);
                    }
                }
            }
        },
        remove (vnode, { r: remove , o: { remove: hostRemove  }  }) {
            const { shapeFlag , children , anchor  } = vnode;
            hostRemove(anchor);
            if (shapeFlag & 16) {
                for(let i = 0; i < children.length; i++){
                    remove(children[i]);
                }
            }
        },
        move: moveTeleport,
        hydrate: hydrateTeleport
    };
    function moveTeleport(vnode, container, parentAnchor, { o: { insert  } , m: move  }, moveType = 2) {
        if (moveType === 0) {
            insert(vnode.targetAnchor, container, parentAnchor);
        }
        const { el , anchor , shapeFlag , children , props  } = vnode;
        const isReorder = moveType === 2;
        if (isReorder) {
            insert(el, container, parentAnchor);
        }
        if (!isReorder || isTeleportDisabled(props)) {
            if (shapeFlag & 16) {
                for(let i = 0; i < children.length; i++){
                    move(children[i], container, parentAnchor, 2);
                }
            }
        }
        if (isReorder) {
            insert(anchor, container, parentAnchor);
        }
    }
    function hydrateTeleport(node, vnode, parentComponent, parentSuspense, optimized, { o: { nextSibling , parentNode , querySelector  }  }, hydrateChildren) {
        const target = vnode.target = resolveTarget(vnode.props, querySelector);
        if (target) {
            const targetNode = target._lpa || target.firstChild;
            if (vnode.shapeFlag & 16) {
                if (isTeleportDisabled(vnode.props)) {
                    vnode.anchor = hydrateChildren(nextSibling(node), vnode, parentNode(node), parentComponent, parentSuspense, optimized);
                    vnode.targetAnchor = targetNode;
                } else {
                    vnode.anchor = nextSibling(node);
                    vnode.targetAnchor = hydrateChildren(targetNode, vnode, target, parentComponent, parentSuspense, optimized);
                }
                target._lpa = vnode.targetAnchor && nextSibling(vnode.targetAnchor);
            }
        }
        return vnode.anchor && nextSibling(vnode.anchor);
    }
    const Teleport = TeleportImpl;
    const COMPONENTS = 'components';
    const DIRECTIVES = 'directives';
    function resolveComponent(name) {
        return resolveAsset('components', name) || name;
    }
    const NULL_DYNAMIC_COMPONENT = Symbol();
    function resolveDynamicComponent(component) {
        if (isString(component)) {
            return resolveAsset('components', component, false) || component;
        } else {
            return component || NULL_DYNAMIC_COMPONENT;
        }
    }
    function resolveDirective(name) {
        return resolveAsset('directives', name);
    }
    function resolveAsset(type, name, warnMissing = true) {
        const instance = currentRenderingInstance || currentInstance;
        if (instance) {
            const Component = instance.type;
            if (type === 'components') {
                const selfName = Component.displayName || Component.name;
                if (selfName && (selfName === name || selfName === camelize(name) || selfName === capitalize(camelize(name)))) {
                    return Component;
                }
            }
            const res = resolve(instance[type] || Component[type], name) || resolve(instance.appContext[type], name);
            if (warnMissing && !res) {
                warn(`Failed to resolve ${type.slice(0, -1)}: ${name}`);
            }
            return res;
        } else {
            warn(`resolve${capitalize(type.slice(0, -1))} ` + `can only be used in render() or setup().`);
        }
    }
    function resolve(registry, name) {
        return registry && (registry[name] || registry[camelize(name)] || registry[capitalize(camelize(name))]);
    }
    const Fragment = Symbol('Fragment');
    const Text1 = Symbol('Text');
    const Comment1 = Symbol('Comment');
    const Static = Symbol('Static');
    const blockStack = [];
    let currentBlock = null;
    function openBlock(disableTracking = false) {
        blockStack.push(currentBlock = disableTracking ? null : []);
    }
    function closeBlock() {
        blockStack.pop();
        currentBlock = blockStack[blockStack.length - 1] || null;
    }
    let shouldTrack$1 = 1;
    function setBlockTracking(value) {
        shouldTrack$1 += value;
    }
    function createBlock(type, props, children, patchFlag, dynamicProps) {
        const vnode = createVNodeWithArgsTransform(type, props, children, patchFlag, dynamicProps, true);
        vnode.dynamicChildren = currentBlock || EMPTY_ARR;
        closeBlock();
        if (shouldTrack$1 > 0 && currentBlock) {
            currentBlock.push(vnode);
        }
        return vnode;
    }
    function isVNode1(value) {
        return value ? value.__v_isVNode === true : false;
    }
    function isSameVNodeType(n1, n2) {
        if (n2.shapeFlag & 6 && hmrDirtyComponents.has(n2.type)) {
            return false;
        }
        return n1.type === n2.type && n1.key === n2.key;
    }
    let vnodeArgsTransformer;
    function transformVNodeArgs(transformer) {
        vnodeArgsTransformer = transformer;
    }
    const createVNodeWithArgsTransform = (...args)=>{
        return _createVNode(...vnodeArgsTransformer ? vnodeArgsTransformer(args, currentRenderingInstance) : args);
    };
    const InternalObjectKey = `__vInternal`;
    const normalizeKey = ({ key  })=>key != null ? key : null
    ;
    const normalizeRef = ({ ref: ref1  })=>{
        return ref1 != null ? isArray(ref1) ? ref1 : {
            i: currentRenderingInstance,
            r: ref1
        } : null;
    };
    const createVNode = createVNodeWithArgsTransform;
    function _createVNode(type, props = null, children = null, patchFlag = 0, dynamicProps = null, isBlockNode = false) {
        if (!type || type === NULL_DYNAMIC_COMPONENT) {
            if (!type) {
                warn(`Invalid vnode type when creating vnode: ${type}.`);
            }
            type = Comment1;
        }
        if (isVNode1(type)) {
            const cloned = cloneVNode(type, props, true);
            if (children) {
                normalizeChildren(cloned, children);
            }
            return cloned;
        }
        if (isClassComponent(type)) {
            type = type.__vccOpts;
        }
        if (props) {
            if (isProxy(props) || InternalObjectKey in props) {
                props = extend({
                }, props);
            }
            let { class: klass , style  } = props;
            if (klass && !isString(klass)) {
                props.class = normalizeClass(klass);
            }
            if (isObject(style)) {
                if (isProxy(style) && !isArray(style)) {
                    style = extend({
                    }, style);
                }
                props.style = normalizeStyle(style);
            }
        }
        const shapeFlag = isString(type) ? 1 : isSuspense(type) ? 128 : isTeleport(type) ? 64 : isObject(type) ? 4 : isFunction(type) ? 2 : 0;
        if (shapeFlag & 4 && isProxy(type)) {
            type = toRaw(type);
            warn(`Vue received a Component which was made a reactive object. This can ` + `lead to unnecessary performance overhead, and should be avoided by ` + `marking the component with \`markRaw\` or using \`shallowRef\` ` + `instead of \`ref\`.`, `\nComponent that was made reactive: `, type);
        }
        const vnode = {
            __v_isVNode: true,
            ["__v_skip"]: true,
            type,
            props,
            key: props && normalizeKey(props),
            ref: props && normalizeRef(props),
            scopeId: currentScopeId,
            children: null,
            component: null,
            suspense: null,
            ssContent: null,
            ssFallback: null,
            dirs: null,
            transition: null,
            el: null,
            anchor: null,
            target: null,
            targetAnchor: null,
            staticCount: 0,
            shapeFlag,
            patchFlag,
            dynamicProps,
            dynamicChildren: null,
            appContext: null
        };
        if (vnode.key !== vnode.key) {
            warn(`VNode created with invalid key (NaN). VNode type:`, vnode.type);
        }
        normalizeChildren(vnode, children);
        if (shapeFlag & 128) {
            const { content , fallback  } = normalizeSuspenseChildren(vnode);
            vnode.ssContent = content;
            vnode.ssFallback = fallback;
        }
        if (shouldTrack$1 > 0 && !isBlockNode && currentBlock && (patchFlag > 0 || shapeFlag & 6) && patchFlag !== 32) {
            currentBlock.push(vnode);
        }
        return vnode;
    }
    function cloneVNode(vnode, extraProps, mergeRef = false) {
        const { props , ref: ref1 , patchFlag  } = vnode;
        const mergedProps = extraProps ? mergeProps(props || {
        }, extraProps) : props;
        return {
            __v_isVNode: true,
            ["__v_skip"]: true,
            type: vnode.type,
            props: mergedProps,
            key: mergedProps && normalizeKey(mergedProps),
            ref: extraProps && extraProps.ref ? mergeRef && ref1 ? isArray(ref1) ? ref1.concat(normalizeRef(extraProps)) : [
                ref1,
                normalizeRef(extraProps)
            ] : normalizeRef(extraProps) : ref1,
            scopeId: vnode.scopeId,
            children: vnode.children,
            target: vnode.target,
            targetAnchor: vnode.targetAnchor,
            staticCount: vnode.staticCount,
            shapeFlag: vnode.shapeFlag,
            patchFlag: extraProps && vnode.type !== Fragment ? patchFlag === -1 ? 16 : patchFlag | 16 : patchFlag,
            dynamicProps: vnode.dynamicProps,
            dynamicChildren: vnode.dynamicChildren,
            appContext: vnode.appContext,
            dirs: vnode.dirs,
            transition: vnode.transition,
            component: vnode.component,
            suspense: vnode.suspense,
            ssContent: vnode.ssContent && cloneVNode(vnode.ssContent),
            ssFallback: vnode.ssFallback && cloneVNode(vnode.ssFallback),
            el: vnode.el,
            anchor: vnode.anchor
        };
    }
    function createTextVNode(text = ' ', flag = 0) {
        return createVNodeWithArgsTransform(Text1, null, text, flag);
    }
    function createStaticVNode(content, numberOfNodes) {
        const vnode = createVNodeWithArgsTransform(Static, null, content);
        vnode.staticCount = numberOfNodes;
        return vnode;
    }
    function createCommentVNode(text = '', asBlock = false) {
        return asBlock ? (openBlock(), createBlock(Comment1, null, text)) : createVNodeWithArgsTransform(Comment1, null, text);
    }
    function normalizeVNode(child) {
        if (child == null || typeof child === 'boolean') {
            return createVNodeWithArgsTransform(Comment1);
        } else if (isArray(child)) {
            return createVNodeWithArgsTransform(Fragment, null, child);
        } else if (typeof child === 'object') {
            return child.el === null ? child : cloneVNode(child);
        } else {
            return createVNodeWithArgsTransform(Text1, null, String(child));
        }
    }
    function cloneIfMounted(child) {
        return child.el === null ? child : cloneVNode(child);
    }
    function normalizeChildren(vnode, children) {
        let type = 0;
        const { shapeFlag  } = vnode;
        if (children == null) {
            children = null;
        } else if (isArray(children)) {
            type = 16;
        } else if (typeof children === 'object') {
            if (shapeFlag & 1 || shapeFlag & 64) {
                const slot = children.default;
                if (slot) {
                    slot._c && setCompiledSlotRendering(1);
                    normalizeChildren(vnode, slot());
                    slot._c && setCompiledSlotRendering(-1);
                }
                return;
            } else {
                type = 32;
                const slotFlag = children._;
                if (!slotFlag && !(InternalObjectKey in children)) {
                    children._ctx = currentRenderingInstance;
                } else if (slotFlag === 3 && currentRenderingInstance) {
                    if (currentRenderingInstance.vnode.patchFlag & 1024) {
                        children._ = 2;
                        vnode.patchFlag |= 1024;
                    } else {
                        children._ = 1;
                    }
                }
            }
        } else if (isFunction(children)) {
            children = {
                default: children,
                _ctx: currentRenderingInstance
            };
            type = 32;
        } else {
            children = String(children);
            if (shapeFlag & 64) {
                type = 16;
                children = [
                    createTextVNode(children)
                ];
            } else {
                type = 8;
            }
        }
        vnode.children = children;
        vnode.shapeFlag |= type;
    }
    function mergeProps(...args) {
        const ret = extend({
        }, args[0]);
        for(let i = 1; i < args.length; i++){
            const toMerge = args[i];
            for(const key in toMerge){
                if (key === 'class') {
                    if (ret.class !== toMerge.class) {
                        ret.class = normalizeClass([
                            ret.class,
                            toMerge.class
                        ]);
                    }
                } else if (key === 'style') {
                    ret.style = normalizeStyle([
                        ret.style,
                        toMerge.style
                    ]);
                } else if (isOn(key)) {
                    const existing = ret[key];
                    const incoming = toMerge[key];
                    if (existing !== incoming) {
                        ret[key] = existing ? [].concat(existing, toMerge[key]) : incoming;
                    }
                } else if (key !== '') {
                    ret[key] = toMerge[key];
                }
            }
        }
        return ret;
    }
    function provide(key, value) {
        if (!currentInstance) {
            {
                warn(`provide() can only be used inside setup().`);
            }
        } else {
            let provides = currentInstance.provides;
            const parentProvides = currentInstance.parent && currentInstance.parent.provides;
            if (parentProvides === provides) {
                provides = currentInstance.provides = Object.create(parentProvides);
            }
            provides[key] = value;
        }
    }
    function inject(key, defaultValue, treatDefaultAsFactory = false) {
        const instance = currentInstance || currentRenderingInstance;
        if (instance) {
            const provides = instance.parent == null ? instance.vnode.appContext && instance.vnode.appContext.provides : instance.parent.provides;
            if (provides && key in provides) {
                return provides[key];
            } else if (arguments.length > 1) {
                return treatDefaultAsFactory && isFunction(defaultValue) ? defaultValue() : defaultValue;
            } else {
                warn(`injection "${String(key)}" not found.`);
            }
        } else {
            warn(`inject() can only be used inside setup() or functional components.`);
        }
    }
    function createDuplicateChecker() {
        const cache = Object.create(null);
        return (type, key)=>{
            if (cache[key]) {
                warn(`${type} property "${key}" is already defined in ${cache[key]}.`);
            } else {
                cache[key] = type;
            }
        };
    }
    let isInBeforeCreate = false;
    function applyOptions(instance, options, deferredData = [], deferredWatch = [], deferredProvide = [], asMixin = false) {
        const { mixins , extends: extendsOptions , data: dataOptions , computed: computedOptions , methods , watch: watchOptions , provide: provideOptions , inject: injectOptions , components , directives , beforeMount , mounted , beforeUpdate , updated , activated , deactivated , beforeDestroy , beforeUnmount , destroyed , unmounted , render , renderTracked , renderTriggered , errorCaptured  } = options;
        const publicThis = instance.proxy;
        const ctx = instance.ctx;
        const globalMixins = instance.appContext.mixins;
        if (asMixin && render && instance.render === NOOP) {
            instance.render = render;
        }
        if (!asMixin) {
            isInBeforeCreate = true;
            callSyncHook('beforeCreate', "bc", options, instance, globalMixins);
            isInBeforeCreate = false;
            applyMixins(instance, globalMixins, deferredData, deferredWatch, deferredProvide);
        }
        if (extendsOptions) {
            applyOptions(instance, extendsOptions, deferredData, deferredWatch, deferredProvide, true);
        }
        if (mixins) {
            applyMixins(instance, mixins, deferredData, deferredWatch, deferredProvide);
        }
        const checkDuplicateProperties = createDuplicateChecker();
        {
            const [propsOptions] = instance.propsOptions;
            if (propsOptions) {
                for(const key in propsOptions){
                    checkDuplicateProperties("Props", key);
                }
            }
        }
        if (injectOptions) {
            if (isArray(injectOptions)) {
                for(let i = 0; i < injectOptions.length; i++){
                    const key = injectOptions[i];
                    ctx[key] = inject(key);
                    {
                        checkDuplicateProperties("Inject", key);
                    }
                }
            } else {
                for(const key in injectOptions){
                    const opt = injectOptions[key];
                    if (isObject(opt)) {
                        ctx[key] = inject(opt.from || key, opt.default, true);
                    } else {
                        ctx[key] = inject(opt);
                    }
                    {
                        checkDuplicateProperties("Inject", key);
                    }
                }
            }
        }
        if (methods) {
            for(const key in methods){
                const methodHandler = methods[key];
                if (isFunction(methodHandler)) {
                    ctx[key] = methodHandler.bind(publicThis);
                    {
                        checkDuplicateProperties("Methods", key);
                    }
                } else {
                    warn(`Method "${key}" has type "${typeof methodHandler}" in the component definition. ` + `Did you reference the function correctly?`);
                }
            }
        }
        if (!asMixin) {
            if (deferredData.length) {
                deferredData.forEach((dataFn)=>resolveData(instance, dataFn, publicThis)
                );
            }
            if (dataOptions) {
                resolveData(instance, dataOptions, publicThis);
            }
            {
                const rawData = toRaw(instance.data);
                for(const key in rawData){
                    checkDuplicateProperties("Data", key);
                    if (key[0] !== '$' && key[0] !== '_') {
                        Object.defineProperty(ctx, key, {
                            configurable: true,
                            enumerable: true,
                            get: ()=>rawData[key]
                            ,
                            set: NOOP
                        });
                    }
                }
            }
        } else if (dataOptions) {
            deferredData.push(dataOptions);
        }
        if (computedOptions) {
            for(const key in computedOptions){
                const opt = computedOptions[key];
                const get2 = isFunction(opt) ? opt.bind(publicThis, publicThis) : isFunction(opt.get) ? opt.get.bind(publicThis, publicThis) : NOOP;
                if (get2 === NOOP) {
                    warn(`Computed property "${key}" has no getter.`);
                }
                const set2 = !isFunction(opt) && isFunction(opt.set) ? opt.set.bind(publicThis) : ()=>{
                    warn(`Write operation failed: computed property "${key}" is readonly.`);
                };
                const c = computed$1({
                    get: get2,
                    set: set2
                });
                Object.defineProperty(ctx, key, {
                    enumerable: true,
                    configurable: true,
                    get: ()=>c.value
                    ,
                    set: (v)=>c.value = v
                });
                {
                    checkDuplicateProperties("Computed", key);
                }
            }
        }
        if (watchOptions) {
            deferredWatch.push(watchOptions);
        }
        if (!asMixin && deferredWatch.length) {
            deferredWatch.forEach((watchOptions1)=>{
                for(const key in watchOptions1){
                    createWatcher(watchOptions1[key], ctx, publicThis, key);
                }
            });
        }
        if (provideOptions) {
            deferredProvide.push(provideOptions);
        }
        if (!asMixin && deferredProvide.length) {
            deferredProvide.forEach((provideOptions1)=>{
                const provides = isFunction(provideOptions1) ? provideOptions1.call(publicThis) : provideOptions1;
                for(const key in provides){
                    provide(key, provides[key]);
                }
            });
        }
        if (asMixin) {
            if (components) {
                extend(instance.components || (instance.components = extend({
                }, instance.type.components)), components);
            }
            if (directives) {
                extend(instance.directives || (instance.directives = extend({
                }, instance.type.directives)), directives);
            }
        }
        if (!asMixin) {
            callSyncHook('created', "c", options, instance, globalMixins);
        }
        if (beforeMount) {
            onBeforeMount(beforeMount.bind(publicThis));
        }
        if (mounted) {
            onMounted(mounted.bind(publicThis));
        }
        if (beforeUpdate) {
            onBeforeUpdate(beforeUpdate.bind(publicThis));
        }
        if (updated) {
            onUpdated(updated.bind(publicThis));
        }
        if (activated) {
            onActivated(activated.bind(publicThis));
        }
        if (deactivated) {
            onDeactivated(deactivated.bind(publicThis));
        }
        if (errorCaptured) {
            onErrorCaptured(errorCaptured.bind(publicThis));
        }
        if (renderTracked) {
            onRenderTracked(renderTracked.bind(publicThis));
        }
        if (renderTriggered) {
            onRenderTriggered(renderTriggered.bind(publicThis));
        }
        if (beforeDestroy) {
            warn(`\`beforeDestroy\` has been renamed to \`beforeUnmount\`.`);
        }
        if (beforeUnmount) {
            onBeforeUnmount(beforeUnmount.bind(publicThis));
        }
        if (destroyed) {
            warn(`\`destroyed\` has been renamed to \`unmounted\`.`);
        }
        if (unmounted) {
            onUnmounted(unmounted.bind(publicThis));
        }
    }
    function callSyncHook(name, type, options, instance, globalMixins) {
        callHookFromMixins(name, type, globalMixins, instance);
        const { extends: base , mixins  } = options;
        if (base) {
            callHookFromExtends(name, type, base, instance);
        }
        if (mixins) {
            callHookFromMixins(name, type, mixins, instance);
        }
        const selfHook = options[name];
        if (selfHook) {
            callWithAsyncErrorHandling(selfHook.bind(instance.proxy), instance, type);
        }
    }
    function callHookFromExtends(name, type, base, instance) {
        if (base.extends) {
            callHookFromExtends(name, type, base.extends, instance);
        }
        const baseHook = base[name];
        if (baseHook) {
            callWithAsyncErrorHandling(baseHook.bind(instance.proxy), instance, type);
        }
    }
    function callHookFromMixins(name, type, mixins, instance) {
        for(let i = 0; i < mixins.length; i++){
            const chainedMixins = mixins[i].mixins;
            if (chainedMixins) {
                callHookFromMixins(name, type, chainedMixins, instance);
            }
            const fn = mixins[i][name];
            if (fn) {
                callWithAsyncErrorHandling(fn.bind(instance.proxy), instance, type);
            }
        }
    }
    function applyMixins(instance, mixins, deferredData, deferredWatch, deferredProvide) {
        for(let i = 0; i < mixins.length; i++){
            applyOptions(instance, mixins[i], deferredData, deferredWatch, deferredProvide, true);
        }
    }
    function resolveData(instance, dataFn, publicThis) {
        if (!isFunction(dataFn)) {
            warn(`The data option must be a function. ` + `Plain object usage is no longer supported.`);
        }
        const data = dataFn.call(publicThis, publicThis);
        if (isPromise(data)) {
            warn(`data() returned a Promise - note data() cannot be async; If you ` + `intend to perform data fetching before component renders, use ` + `async setup() + <Suspense>.`);
        }
        if (!isObject(data)) {
            warn(`data() should return an object.`);
        } else if (instance.data === EMPTY_OBJ) {
            instance.data = reactive(data);
        } else {
            extend(instance.data, data);
        }
    }
    function createWatcher(raw, ctx, publicThis, key) {
        const getter1 = key.includes('.') ? createPathGetter(publicThis, key) : ()=>publicThis[key]
        ;
        if (isString(raw)) {
            const handler = ctx[raw];
            if (isFunction(handler)) {
                watch(getter1, handler);
            } else {
                warn(`Invalid watch handler specified by key "${raw}"`, handler);
            }
        } else if (isFunction(raw)) {
            watch(getter1, raw.bind(publicThis));
        } else if (isObject(raw)) {
            if (isArray(raw)) {
                raw.forEach((r)=>createWatcher(r, ctx, publicThis, key)
                );
            } else {
                const handler = isFunction(raw.handler) ? raw.handler.bind(publicThis) : ctx[raw.handler];
                if (isFunction(handler)) {
                    watch(getter1, handler, raw);
                } else {
                    warn(`Invalid watch handler specified by key "${raw.handler}"`, handler);
                }
            }
        } else {
            warn(`Invalid watch option: "${key}"`, raw);
        }
    }
    function createPathGetter(ctx, path) {
        const segments = path.split('.');
        return ()=>{
            let cur = ctx;
            for(let i = 0; i < segments.length && cur; i++){
                cur = cur[segments[i]];
            }
            return cur;
        };
    }
    function resolveMergedOptions(instance) {
        const raw = instance.type;
        const { __merged , mixins , extends: extendsOptions  } = raw;
        if (__merged) return __merged;
        const globalMixins = instance.appContext.mixins;
        if (!globalMixins.length && !mixins && !extendsOptions) return raw;
        const options = {
        };
        globalMixins.forEach((m)=>mergeOptions(options, m, instance)
        );
        mergeOptions(options, raw, instance);
        return raw.__merged = options;
    }
    function mergeOptions(to, from, instance) {
        const strats = instance.appContext.config.optionMergeStrategies;
        const { mixins , extends: extendsOptions  } = from;
        extendsOptions && mergeOptions(to, extendsOptions, instance);
        mixins && mixins.forEach((m)=>mergeOptions(to, m, instance)
        );
        for(const key in from){
            if (strats && hasOwn(strats, key)) {
                to[key] = strats[key](to[key], from[key], instance.proxy, key);
            } else {
                to[key] = from[key];
            }
        }
    }
    const publicPropertiesMap = extend(Object.create(null), {
        $: (i)=>i
        ,
        $el: (i)=>i.vnode.el
        ,
        $data: (i)=>i.data
        ,
        $props: (i)=>shallowReadonly(i.props)
        ,
        $attrs: (i)=>shallowReadonly(i.attrs)
        ,
        $slots: (i)=>shallowReadonly(i.slots)
        ,
        $refs: (i)=>shallowReadonly(i.refs)
        ,
        $parent: (i)=>i.parent && i.parent.proxy
        ,
        $root: (i)=>i.root && i.root.proxy
        ,
        $emit: (i)=>i.emit
        ,
        $options: (i)=>resolveMergedOptions(i)
        ,
        $forceUpdate: (i)=>()=>queueJob(i.update)
        ,
        $nextTick: (i)=>nextTick.bind(i.proxy)
        ,
        $watch: (i)=>instanceWatch.bind(i)
    });
    const PublicInstanceProxyHandlers = {
        get ({ _: instance  }, key) {
            const { ctx , setupState , data , props , accessCache , type , appContext  } = instance;
            if (key === "__v_skip") {
                return true;
            }
            if (key === '__isVue') {
                return true;
            }
            let normalizedProps;
            if (key[0] !== '$') {
                const n = accessCache[key];
                if (n !== undefined) {
                    switch(n){
                        case 0:
                            return setupState[key];
                        case 1:
                            return data[key];
                        case 3:
                            return ctx[key];
                        case 2:
                            return props[key];
                    }
                } else if (setupState !== EMPTY_OBJ && hasOwn(setupState, key)) {
                    accessCache[key] = 0;
                    return setupState[key];
                } else if (data !== EMPTY_OBJ && hasOwn(data, key)) {
                    accessCache[key] = 1;
                    return data[key];
                } else if ((normalizedProps = instance.propsOptions[0]) && hasOwn(normalizedProps, key)) {
                    accessCache[key] = 2;
                    return props[key];
                } else if (ctx !== EMPTY_OBJ && hasOwn(ctx, key)) {
                    accessCache[key] = 3;
                    return ctx[key];
                } else if (!isInBeforeCreate) {
                    accessCache[key] = 4;
                }
            }
            const publicGetter = publicPropertiesMap[key];
            let cssModule, globalProperties;
            if (publicGetter) {
                if (key === '$attrs') {
                    track(instance, "get", key);
                    markAttrsAccessed();
                }
                return publicGetter(instance);
            } else if ((cssModule = type.__cssModules) && (cssModule = cssModule[key])) {
                return cssModule;
            } else if (ctx !== EMPTY_OBJ && hasOwn(ctx, key)) {
                accessCache[key] = 3;
                return ctx[key];
            } else if ((globalProperties = appContext.config.globalProperties, hasOwn(globalProperties, key))) {
                return globalProperties[key];
            } else if (currentRenderingInstance && (!isString(key) || key.indexOf('__v') !== 0)) {
                if (data !== EMPTY_OBJ && (key[0] === '$' || key[0] === '_') && hasOwn(data, key)) {
                    warn(`Property ${JSON.stringify(key)} must be accessed via $data because it starts with a reserved ` + `character ("$" or "_") and is not proxied on the render context.`);
                } else {
                    warn(`Property ${JSON.stringify(key)} was accessed during render ` + `but is not defined on instance.`);
                }
            }
        },
        set ({ _: instance  }, key, value) {
            const { data , setupState , ctx  } = instance;
            if (setupState !== EMPTY_OBJ && hasOwn(setupState, key)) {
                setupState[key] = value;
            } else if (data !== EMPTY_OBJ && hasOwn(data, key)) {
                data[key] = value;
            } else if (key in instance.props) {
                warn(`Attempting to mutate prop "${key}". Props are readonly.`, instance);
                return false;
            }
            if (key[0] === '$' && key.slice(1) in instance) {
                warn(`Attempting to mutate public property "${key}". ` + `Properties starting with $ are reserved and readonly.`, instance);
                return false;
            } else {
                if (key in instance.appContext.config.globalProperties) {
                    Object.defineProperty(ctx, key, {
                        enumerable: true,
                        configurable: true,
                        value
                    });
                } else {
                    ctx[key] = value;
                }
            }
            return true;
        },
        has ({ _: { data , setupState , accessCache , ctx , appContext , propsOptions  }  }, key) {
            let normalizedProps;
            return accessCache[key] !== undefined || data !== EMPTY_OBJ && hasOwn(data, key) || setupState !== EMPTY_OBJ && hasOwn(setupState, key) || (normalizedProps = propsOptions[0]) && hasOwn(normalizedProps, key) || hasOwn(ctx, key) || hasOwn(publicPropertiesMap, key) || hasOwn(appContext.config.globalProperties, key);
        }
    };
    {
        PublicInstanceProxyHandlers.ownKeys = (target)=>{
            warn(`Avoid app logic that relies on enumerating keys on a component instance. ` + `The keys will be empty in production mode to avoid performance overhead.`);
            return Reflect.ownKeys(target);
        };
    }
    const RuntimeCompiledPublicInstanceProxyHandlers = extend({
    }, PublicInstanceProxyHandlers, {
        get (target, key) {
            if (key === Symbol.unscopables) {
                return;
            }
            return PublicInstanceProxyHandlers.get(target, key, target);
        },
        has (_, key) {
            const has1 = key[0] !== '_' && !isGloballyWhitelisted(key);
            if (!has1 && PublicInstanceProxyHandlers.has(_, key)) {
                warn(`Property ${JSON.stringify(key)} should not start with _ which is a reserved prefix for Vue internals.`);
            }
            return has1;
        }
    });
    function createRenderContext(instance) {
        const target = {
        };
        Object.defineProperty(target, `_`, {
            configurable: true,
            enumerable: false,
            get: ()=>instance
        });
        Object.keys(publicPropertiesMap).forEach((key)=>{
            Object.defineProperty(target, key, {
                configurable: true,
                enumerable: false,
                get: ()=>publicPropertiesMap[key](instance)
                ,
                set: NOOP
            });
        });
        const { globalProperties  } = instance.appContext.config;
        Object.keys(globalProperties).forEach((key)=>{
            Object.defineProperty(target, key, {
                configurable: true,
                enumerable: false,
                get: ()=>globalProperties[key]
                ,
                set: NOOP
            });
        });
        return target;
    }
    function exposePropsOnRenderContext(instance) {
        const { ctx , propsOptions: [propsOptions]  } = instance;
        if (propsOptions) {
            Object.keys(propsOptions).forEach((key)=>{
                Object.defineProperty(ctx, key, {
                    enumerable: true,
                    configurable: true,
                    get: ()=>instance.props[key]
                    ,
                    set: NOOP
                });
            });
        }
    }
    function exposeSetupStateOnRenderContext(instance) {
        const { ctx , setupState  } = instance;
        Object.keys(toRaw(setupState)).forEach((key)=>{
            if (key[0] === '$' || key[0] === '_') {
                warn(`setup() return property ${JSON.stringify(key)} should not start with "$" or "_" ` + `which are reserved prefixes for Vue internals.`);
                return;
            }
            Object.defineProperty(ctx, key, {
                enumerable: true,
                configurable: true,
                get: ()=>setupState[key]
                ,
                set: NOOP
            });
        });
    }
    const emptyAppContext = createAppContext();
    let uid$2 = 0;
    function createComponentInstance(vnode, parent, suspense) {
        const type = vnode.type;
        const appContext = (parent ? parent.appContext : vnode.appContext) || emptyAppContext;
        const instance = {
            uid: uid$2++,
            vnode,
            type,
            parent,
            appContext,
            root: null,
            next: null,
            subTree: null,
            update: null,
            render: null,
            proxy: null,
            withProxy: null,
            effects: null,
            provides: parent ? parent.provides : Object.create(appContext.provides),
            accessCache: null,
            renderCache: [],
            components: null,
            directives: null,
            propsOptions: normalizePropsOptions(type, appContext),
            emitsOptions: normalizeEmitsOptions(type, appContext),
            emit: null,
            emitted: null,
            ctx: EMPTY_OBJ,
            data: EMPTY_OBJ,
            props: EMPTY_OBJ,
            attrs: EMPTY_OBJ,
            slots: EMPTY_OBJ,
            refs: EMPTY_OBJ,
            setupState: EMPTY_OBJ,
            setupContext: null,
            suspense,
            suspenseId: suspense ? suspense.pendingId : 0,
            asyncDep: null,
            asyncResolved: false,
            isMounted: false,
            isUnmounted: false,
            isDeactivated: false,
            bc: null,
            c: null,
            bm: null,
            m: null,
            bu: null,
            u: null,
            um: null,
            bum: null,
            da: null,
            a: null,
            rtg: null,
            rtc: null,
            ec: null
        };
        {
            instance.ctx = createRenderContext(instance);
        }
        instance.root = parent ? parent.root : instance;
        instance.emit = emit.bind(null, instance);
        {
            devtoolsComponentAdded(instance);
        }
        return instance;
    }
    let currentInstance = null;
    const getCurrentInstance = ()=>currentInstance || currentRenderingInstance
    ;
    const setCurrentInstance = (instance)=>{
        currentInstance = instance;
    };
    const isBuiltInTag = makeMap('slot,component');
    function validateComponentName(name, config) {
        const appIsNativeTag = config.isNativeTag || NO;
        if (isBuiltInTag(name) || appIsNativeTag(name)) {
            warn('Do not use built-in or reserved HTML elements as component id: ' + name);
        }
    }
    let isInSSRComponentSetup = false;
    function setupComponent(instance, isSSR = false) {
        isInSSRComponentSetup = isSSR;
        const { props , children , shapeFlag  } = instance.vnode;
        const isStateful = shapeFlag & 4;
        initProps(instance, props, isStateful, isSSR);
        initSlots(instance, children);
        const setupResult = isStateful ? setupStatefulComponent(instance, isSSR) : undefined;
        isInSSRComponentSetup = false;
        return setupResult;
    }
    function setupStatefulComponent(instance, isSSR) {
        const Component = instance.type;
        {
            if (Component.name) {
                validateComponentName(Component.name, instance.appContext.config);
            }
            if (Component.components) {
                const names = Object.keys(Component.components);
                for(let i = 0; i < names.length; i++){
                    validateComponentName(names[i], instance.appContext.config);
                }
            }
            if (Component.directives) {
                const names = Object.keys(Component.directives);
                for(let i = 0; i < names.length; i++){
                    validateDirectiveName(names[i]);
                }
            }
        }
        instance.accessCache = Object.create(null);
        instance.proxy = new Proxy(instance.ctx, PublicInstanceProxyHandlers);
        {
            exposePropsOnRenderContext(instance);
        }
        const { setup  } = Component;
        if (setup) {
            const setupContext = instance.setupContext = setup.length > 1 ? createSetupContext(instance) : null;
            currentInstance = instance;
            pauseTracking();
            const setupResult = callWithErrorHandling(setup, instance, 0, [
                shallowReadonly(instance.props),
                setupContext
            ]);
            resetTracking();
            currentInstance = null;
            if (isPromise(setupResult)) {
                if (isSSR) {
                    return setupResult.then((resolvedResult)=>{
                        handleSetupResult(instance, resolvedResult);
                    });
                } else {
                    instance.asyncDep = setupResult;
                }
            } else {
                handleSetupResult(instance, setupResult);
            }
        } else {
            finishComponentSetup(instance);
        }
    }
    function handleSetupResult(instance, setupResult, isSSR) {
        if (isFunction(setupResult)) {
            instance.render = setupResult;
        } else if (isObject(setupResult)) {
            if (isVNode1(setupResult)) {
                warn(`setup() should not return VNodes directly - ` + `return a render function instead.`);
            }
            {
                instance.devtoolsRawSetupState = setupResult;
            }
            instance.setupState = proxyRefs(setupResult);
            {
                exposeSetupStateOnRenderContext(instance);
            }
        } else if (setupResult !== undefined) {
            warn(`setup() should return an object. Received: ${setupResult === null ? 'null' : typeof setupResult}`);
        }
        finishComponentSetup(instance);
    }
    let compile;
    function registerRuntimeCompiler(_compile) {
        compile = _compile;
    }
    function finishComponentSetup(instance, isSSR) {
        const Component = instance.type;
        if (!instance.render) {
            if (compile && Component.template && !Component.render) {
                {
                    startMeasure(instance, `compile`);
                }
                Component.render = compile(Component.template, {
                    isCustomElement: instance.appContext.config.isCustomElement,
                    delimiters: Component.delimiters
                });
                {
                    endMeasure(instance, `compile`);
                }
            }
            instance.render = Component.render || NOOP;
            if (instance.render._rc) {
                instance.withProxy = new Proxy(instance.ctx, RuntimeCompiledPublicInstanceProxyHandlers);
            }
        }
        {
            currentInstance = instance;
            applyOptions(instance, Component);
            currentInstance = null;
        }
        if (!Component.render && instance.render === NOOP) {
            if (!compile && Component.template) {
                warn(`Component provided template option but ` + `runtime compilation is not supported in this build of Vue.` + ` Use "vue.global.js" instead.`);
            } else {
                warn(`Component is missing template or render function.`);
            }
        }
    }
    const attrHandlers = {
        get: (target, key)=>{
            {
                markAttrsAccessed();
            }
            return target[key];
        },
        set: ()=>{
            warn(`setupContext.attrs is readonly.`);
            return false;
        },
        deleteProperty: ()=>{
            warn(`setupContext.attrs is readonly.`);
            return false;
        }
    };
    function createSetupContext(instance) {
        {
            return Object.freeze({
                get attrs () {
                    return new Proxy(instance.attrs, attrHandlers);
                },
                get slots () {
                    return shallowReadonly(instance.slots);
                },
                get emit () {
                    return (event, ...args)=>instance.emit(event, ...args)
                    ;
                }
            });
        }
    }
    function recordInstanceBoundEffect(effect1) {
        if (currentInstance) {
            (currentInstance.effects || (currentInstance.effects = [])).push(effect1);
        }
    }
    const classifyRE = /(?:^|[-_])(\w)/g;
    const classify = (str)=>str.replace(/(?:^|[-_])(\w)/g, (c)=>c.toUpperCase()
        ).replace(/[-_]/g, '')
    ;
    function formatComponentName(instance, Component, isRoot = false) {
        let name = isFunction(Component) ? Component.displayName || Component.name : Component.name;
        if (!name && Component.__file) {
            const match = Component.__file.match(/([^/\\]+)\.vue$/);
            if (match) {
                name = match[1];
            }
        }
        if (!name && instance && instance.parent) {
            const inferFromRegistry = (registry)=>{
                for(const key in registry){
                    if (registry[key] === Component) {
                        return key;
                    }
                }
            };
            name = inferFromRegistry(instance.components || instance.parent.type.components) || inferFromRegistry(instance.appContext.components);
        }
        return name ? classify(name) : isRoot ? `App` : `Anonymous`;
    }
    function isClassComponent(value) {
        return isFunction(value) && '__vccOpts' in value;
    }
    function computed$1(getterOrOptions) {
        const c = computed(getterOrOptions);
        recordInstanceBoundEffect(c.effect);
        return c;
    }
    function defineComponent(options) {
        return isFunction(options) ? {
            setup: options,
            name: options.name
        } : options;
    }
    function defineAsyncComponent(source) {
        if (isFunction(source)) {
            source = {
                loader: source
            };
        }
        const { loader , loadingComponent: loadingComponent , errorComponent: errorComponent , delay =200 , timeout , suspensible =true , onError: userOnError  } = source;
        let pendingRequest = null;
        let resolvedComp;
        let retries = 0;
        const retry = ()=>{
            retries++;
            pendingRequest = null;
            return load();
        };
        const load = ()=>{
            let thisRequest;
            return pendingRequest || (thisRequest = pendingRequest = loader().catch((err)=>{
                err = err instanceof Error ? err : new Error(String(err));
                if (userOnError) {
                    return new Promise((resolve1, reject)=>{
                        const userRetry = ()=>resolve1(retry())
                        ;
                        const userFail = ()=>reject(err)
                        ;
                        userOnError(err, userRetry, userFail, retries + 1);
                    });
                } else {
                    throw err;
                }
            }).then((comp)=>{
                if (thisRequest !== pendingRequest && pendingRequest) {
                    return pendingRequest;
                }
                if (!comp) {
                    warn(`Async component loader resolved to undefined. ` + `If you are using retry(), make sure to return its return value.`);
                }
                if (comp && (comp.__esModule || comp[Symbol.toStringTag] === 'Module')) {
                    comp = comp.default;
                }
                if (comp && !isObject(comp) && !isFunction(comp)) {
                    throw new Error(`Invalid async component load result: ${comp}`);
                }
                resolvedComp = comp;
                return comp;
            }));
        };
        return defineComponent({
            __asyncLoader: load,
            name: 'AsyncComponentWrapper',
            setup () {
                const instance = currentInstance;
                if (resolvedComp) {
                    return ()=>createInnerComp(resolvedComp, currentInstance)
                    ;
                }
                const onError = (err)=>{
                    pendingRequest = null;
                    handleError(err, currentInstance, 13, !errorComponent);
                };
                if (suspensible && currentInstance.suspense || false) {
                    return load().then((comp)=>{
                        return ()=>createInnerComp(comp, currentInstance)
                        ;
                    }).catch((err)=>{
                        onError(err);
                        return ()=>errorComponent ? createVNodeWithArgsTransform(errorComponent, {
                                error: err
                            }) : null
                        ;
                    });
                }
                const loaded = ref(false);
                const error = ref();
                const delayed = ref(!!delay);
                if (delay) {
                    setTimeout(()=>{
                        delayed.value = false;
                    }, delay);
                }
                if (timeout != null) {
                    setTimeout(()=>{
                        if (!loaded.value && !error.value) {
                            const err = new Error(`Async component timed out after ${timeout}ms.`);
                            onError(err);
                            error.value = err;
                        }
                    }, timeout);
                }
                load().then(()=>{
                    loaded.value = true;
                }).catch((err)=>{
                    onError(err);
                    error.value = err;
                });
                return ()=>{
                    if (loaded.value && resolvedComp) {
                        return createInnerComp(resolvedComp, currentInstance);
                    } else if (error.value && errorComponent) {
                        return createVNodeWithArgsTransform(errorComponent, {
                            error: error.value
                        });
                    } else if (loadingComponent && !delayed.value) {
                        return createVNodeWithArgsTransform(loadingComponent);
                    }
                };
            }
        });
    }
    function createInnerComp(comp, { vnode: { props , children  }  }) {
        return createVNodeWithArgsTransform(comp, props, children);
    }
    function h(type, propsOrChildren, children) {
        const l = arguments.length;
        if (l === 2) {
            if (isObject(propsOrChildren) && !isArray(propsOrChildren)) {
                if (isVNode1(propsOrChildren)) {
                    return createVNodeWithArgsTransform(type, null, [
                        propsOrChildren
                    ]);
                }
                return createVNodeWithArgsTransform(type, propsOrChildren);
            } else {
                return createVNodeWithArgsTransform(type, null, propsOrChildren);
            }
        } else {
            if (l > 3) {
                children = Array.prototype.slice.call(arguments, 2);
            } else if (l === 3 && isVNode1(children)) {
                children = [
                    children
                ];
            }
            return createVNodeWithArgsTransform(type, propsOrChildren, children);
        }
    }
    const ssrContextKey = Symbol(`ssrContext`);
    const useSSRContext = ()=>{
        {
            warn(`useSsrContext() is not supported in the global build.`);
        }
    };
    function initCustomFormatter() {
        const vueStyle = {
            style: 'color:#3ba776'
        };
        const numberStyle = {
            style: 'color:#0b1bc9'
        };
        const stringStyle = {
            style: 'color:#b62e24'
        };
        const keywordStyle = {
            style: 'color:#9d288c'
        };
        const formatter = {
            header (obj) {
                if (!isObject(obj)) {
                    return null;
                }
                if (obj.__isVue) {
                    return [
                        'div',
                        vueStyle,
                        `VueInstance`
                    ];
                } else if (isRef(obj)) {
                    return [
                        'div',
                        {
                        },
                        [
                            'span',
                            vueStyle,
                            genRefFlag(obj)
                        ],
                        '<',
                        formatValue(obj.value),
                        `>`
                    ];
                } else if (isReactive(obj)) {
                    return [
                        'div',
                        {
                        },
                        [
                            'span',
                            vueStyle,
                            'Reactive'
                        ],
                        '<',
                        formatValue(obj),
                        `>${isReadonly(obj) ? ` (readonly)` : ``}`
                    ];
                } else if (isReadonly(obj)) {
                    return [
                        'div',
                        {
                        },
                        [
                            'span',
                            vueStyle,
                            'Readonly'
                        ],
                        '<',
                        formatValue(obj),
                        '>'
                    ];
                }
                return null;
            },
            hasBody (obj) {
                return obj && obj.__isVue;
            },
            body (obj) {
                if (obj && obj.__isVue) {
                    return [
                        'div',
                        {
                        },
                        ...formatInstance(obj.$)
                    ];
                }
            }
        };
        function formatInstance(instance) {
            const blocks = [];
            if (instance.type.props && instance.props) {
                blocks.push(createInstanceBlock('props', toRaw(instance.props)));
            }
            if (instance.setupState !== EMPTY_OBJ) {
                blocks.push(createInstanceBlock('setup', instance.setupState));
            }
            if (instance.data !== EMPTY_OBJ) {
                blocks.push(createInstanceBlock('data', toRaw(instance.data)));
            }
            const computed1 = extractKeys(instance, 'computed');
            if (computed1) {
                blocks.push(createInstanceBlock('computed', computed1));
            }
            const injected = extractKeys(instance, 'inject');
            if (injected) {
                blocks.push(createInstanceBlock('injected', injected));
            }
            blocks.push([
                'div',
                {
                },
                [
                    'span',
                    {
                        style: keywordStyle.style + ';opacity:0.66'
                    },
                    '$ (internal): '
                ],
                [
                    'object',
                    {
                        object: instance
                    }
                ]
            ]);
            return blocks;
        }
        function createInstanceBlock(type, target) {
            target = extend({
            }, target);
            if (!Object.keys(target).length) {
                return [
                    'span',
                    {
                    }
                ];
            }
            return [
                'div',
                {
                    style: 'line-height:1.25em;margin-bottom:0.6em'
                },
                [
                    'div',
                    {
                        style: 'color:#476582'
                    },
                    type
                ],
                [
                    'div',
                    {
                        style: 'padding-left:1.25em'
                    },
                    ...Object.keys(target).map((key)=>{
                        return [
                            'div',
                            {
                            },
                            [
                                'span',
                                keywordStyle,
                                key + ': '
                            ],
                            formatValue(target[key], false)
                        ];
                    })
                ]
            ];
        }
        function formatValue(v, asRaw = true) {
            if (typeof v === 'number') {
                return [
                    'span',
                    numberStyle,
                    v
                ];
            } else if (typeof v === 'string') {
                return [
                    'span',
                    stringStyle,
                    JSON.stringify(v)
                ];
            } else if (typeof v === 'boolean') {
                return [
                    'span',
                    keywordStyle,
                    v
                ];
            } else if (isObject(v)) {
                return [
                    'object',
                    {
                        object: asRaw ? toRaw(v) : v
                    }
                ];
            } else {
                return [
                    'span',
                    stringStyle,
                    String(v)
                ];
            }
        }
        function extractKeys(instance, type) {
            const Comp = instance.type;
            if (isFunction(Comp)) {
                return;
            }
            const extracted = {
            };
            for(const key in instance.ctx){
                if (isKeyOfType(Comp, key, type)) {
                    extracted[key] = instance.ctx[key];
                }
            }
            return extracted;
        }
        function isKeyOfType(Comp, key, type) {
            const opts = Comp[type];
            if (isArray(opts) && opts.includes(key) || isObject(opts) && key in opts) {
                return true;
            }
            if (Comp.extends && isKeyOfType(Comp.extends, key, type)) {
                return true;
            }
            if (Comp.mixins && Comp.mixins.some((m)=>isKeyOfType(m, key, type)
            )) {
                return true;
            }
        }
        function genRefFlag(v) {
            if (v._shallow) {
                return `ShallowRef`;
            }
            if (v.effect) {
                return `ComputedRef`;
            }
            return `Ref`;
        }
        if (window.devtoolsFormatters) {
            window.devtoolsFormatters.push(formatter);
        } else {
            window.devtoolsFormatters = [
                formatter
            ];
        }
    }
    function renderList(source, renderItem) {
        let ret;
        if (isArray(source) || isString(source)) {
            ret = new Array(source.length);
            for(let i = 0, l = source.length; i < l; i++){
                ret[i] = renderItem(source[i], i);
            }
        } else if (typeof source === 'number') {
            if (!Number.isInteger(source)) {
                warn(`The v-for range expect an integer value but got ${source}.`);
                return [];
            }
            ret = new Array(source);
            for(let i = 0; i < source; i++){
                ret[i] = renderItem(i + 1, i);
            }
        } else if (isObject(source)) {
            if (source[Symbol.iterator]) {
                ret = Array.from(source, renderItem);
            } else {
                const keys = Object.keys(source);
                ret = new Array(keys.length);
                for(let i = 0, l = keys.length; i < l; i++){
                    const key = keys[i];
                    ret[i] = renderItem(source[key], key, i);
                }
            }
        } else {
            ret = [];
        }
        return ret;
    }
    function toHandlers(obj) {
        const ret = {
        };
        if (!isObject(obj)) {
            warn(`v-on with no argument expects an object value.`);
            return ret;
        }
        for(const key in obj){
            ret[toHandlerKey(key)] = obj[key];
        }
        return ret;
    }
    function createSlots(slots, dynamicSlots) {
        for(let i = 0; i < dynamicSlots.length; i++){
            const slot = dynamicSlots[i];
            if (isArray(slot)) {
                for(let j = 0; j < slot.length; j++){
                    slots[slot[j].name] = slot[j].fn;
                }
            } else if (slot) {
                slots[slot.name] = slot.fn;
            }
        }
        return slots;
    }
    const version = "3.0.2";
    const ssrUtils = null;
    const svgNS = 'http://www.w3.org/2000/svg';
    const doc = typeof document !== 'undefined' ? document : null;
    let tempContainer;
    let tempSVGContainer;
    const nodeOps = {
        insert: (child, parent, anchor)=>{
            parent.insertBefore(child, anchor || null);
        },
        remove: (child)=>{
            const parent = child.parentNode;
            if (parent) {
                parent.removeChild(child);
            }
        },
        createElement: (tag, isSVG, is)=>isSVG ? doc.createElementNS('http://www.w3.org/2000/svg', tag) : doc.createElement(tag, is ? {
                is
            } : undefined)
        ,
        createText: (text)=>doc.createTextNode(text)
        ,
        createComment: (text)=>doc.createComment(text)
        ,
        setText: (node, text)=>{
            node.nodeValue = text;
        },
        setElementText: (el, text)=>{
            el.textContent = text;
        },
        parentNode: (node)=>node.parentNode
        ,
        nextSibling: (node)=>node.nextSibling
        ,
        querySelector: (selector)=>doc.querySelector(selector)
        ,
        setScopeId (el, id) {
            el.setAttribute(id, '');
        },
        cloneNode (el) {
            return el.cloneNode(true);
        },
        insertStaticContent (content, parent, anchor, isSVG) {
            const temp = isSVG ? tempSVGContainer || (tempSVGContainer = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')) : tempContainer || (tempContainer = doc.createElement('div'));
            temp.innerHTML = content;
            const first = temp.firstChild;
            let node = first;
            let last = node;
            while(node){
                last = node;
                nodeOps.insert(node, parent, anchor);
                node = temp.firstChild;
            }
            return [
                first,
                last
            ];
        }
    };
    function patchClass(el, value, isSVG) {
        if (value == null) {
            value = '';
        }
        if (isSVG) {
            el.setAttribute('class', value);
        } else {
            const transitionClasses = el._vtc;
            if (transitionClasses) {
                value = (value ? [
                    value,
                    ...transitionClasses
                ] : [
                    ...transitionClasses
                ]).join(' ');
            }
            el.className = value;
        }
    }
    function patchStyle(el, prev, next) {
        const style = el.style;
        if (!next) {
            el.removeAttribute('style');
        } else if (isString(next)) {
            if (prev !== next) {
                style.cssText = next;
            }
        } else {
            for(const key in next){
                setStyle(style, key, next[key]);
            }
            if (prev && !isString(prev)) {
                for(const key1 in prev){
                    if (next[key1] == null) {
                        setStyle(style, key1, '');
                    }
                }
            }
        }
    }
    const importantRE = /\s*!important$/;
    function setStyle(style, name, val) {
        if (isArray(val)) {
            val.forEach((v)=>setStyle(style, name, v)
            );
        } else {
            if (name.startsWith('--')) {
                style.setProperty(name, val);
            } else {
                const prefixed = autoPrefix(style, name);
                if (/\s*!important$/.test(val)) {
                    style.setProperty(hyphenate(prefixed), val.replace(/\s*!important$/, ''), 'important');
                } else {
                    style[prefixed] = val;
                }
            }
        }
    }
    const prefixes = [
        'Webkit',
        'Moz',
        'ms'
    ];
    const prefixCache = {
    };
    function autoPrefix(style, rawName) {
        const cached = prefixCache[rawName];
        if (cached) {
            return cached;
        }
        let name = camelize(rawName);
        if (name !== 'filter' && name in style) {
            return prefixCache[rawName] = name;
        }
        name = capitalize(name);
        for(let i = 0; i < prefixes.length; i++){
            const prefixed = prefixes[i] + name;
            if (prefixed in style) {
                return prefixCache[rawName] = prefixed;
            }
        }
        return rawName;
    }
    const xlinkNS = 'http://www.w3.org/1999/xlink';
    function patchAttr(el, key, value, isSVG) {
        if (isSVG && key.startsWith('xlink:')) {
            if (value == null) {
                el.removeAttributeNS('http://www.w3.org/1999/xlink', key.slice(6, key.length));
            } else {
                el.setAttributeNS('http://www.w3.org/1999/xlink', key, value);
            }
        } else {
            const isBoolean1 = isSpecialBooleanAttr(key);
            if (value == null || isBoolean1 && value === false) {
                el.removeAttribute(key);
            } else {
                el.setAttribute(key, isBoolean1 ? '' : value);
            }
        }
    }
    function patchDOMProp(el, key, value, prevChildren, parentComponent, parentSuspense, unmountChildren) {
        if (key === 'innerHTML' || key === 'textContent') {
            if (prevChildren) {
                unmountChildren(prevChildren, parentComponent, parentSuspense);
            }
            el[key] = value == null ? '' : value;
            return;
        }
        if (key === 'value' && el.tagName !== 'PROGRESS') {
            el._value = value;
            const newValue = value == null ? '' : value;
            if (el.value !== newValue) {
                el.value = newValue;
            }
            return;
        }
        if (value === '' && typeof el[key] === 'boolean') {
            el[key] = true;
        } else if (value == null && typeof el[key] === 'string') {
            el[key] = '';
            el.removeAttribute(key);
        } else {
            try {
                el[key] = value;
            } catch (e) {
                {
                    warn(`Failed setting prop "${key}" on <${el.tagName.toLowerCase()}>: ` + `value ${value} is invalid.`, e);
                }
            }
        }
    }
    let _getNow = Date.now;
    if (typeof document !== 'undefined' && _getNow() > document.createEvent('Event').timeStamp) {
        _getNow = ()=>performance.now()
        ;
    }
    let cachedNow = 0;
    const p = Promise.resolve();
    const reset = ()=>{
        cachedNow = 0;
    };
    const getNow = ()=>cachedNow || (p.then(reset), cachedNow = _getNow())
    ;
    function addEventListener(el, event, handler, options) {
        el.addEventListener(event, handler, options);
    }
    function removeEventListener(el, event, handler, options) {
        el.removeEventListener(event, handler, options);
    }
    function patchEvent(el, rawName, prevValue, nextValue, instance = null) {
        const invokers = el._vei || (el._vei = {
        });
        const existingInvoker = invokers[rawName];
        if (nextValue && existingInvoker) {
            existingInvoker.value = nextValue;
        } else {
            const [name, options] = parseName(rawName);
            if (nextValue) {
                const invoker = invokers[rawName] = createInvoker(nextValue, instance);
                addEventListener(el, name, invoker, options);
            } else if (existingInvoker) {
                removeEventListener(el, name, existingInvoker, options);
                invokers[rawName] = undefined;
            }
        }
    }
    const optionsModifierRE = /(?:Once|Passive|Capture)$/;
    function parseName(name) {
        let options;
        if (/(?:Once|Passive|Capture)$/.test(name)) {
            options = {
            };
            let m;
            while(m = name.match(/(?:Once|Passive|Capture)$/)){
                name = name.slice(0, name.length - m[0].length);
                options[m[0].toLowerCase()] = true;
            }
        }
        return [
            name.slice(2).toLowerCase(),
            options
        ];
    }
    function createInvoker(initialValue, instance) {
        const invoker = (e)=>{
            const timeStamp = e.timeStamp || _getNow();
            if (timeStamp >= invoker.attached - 1) {
                callWithAsyncErrorHandling(patchStopImmediatePropagation(e, invoker.value), instance, 5, [
                    e
                ]);
            }
        };
        invoker.value = initialValue;
        invoker.attached = getNow();
        return invoker;
    }
    function patchStopImmediatePropagation(e, value) {
        if (isArray(value)) {
            const originalStop = e.stopImmediatePropagation;
            e.stopImmediatePropagation = ()=>{
                originalStop.call(e);
                e._stopped = true;
            };
            return value.map((fn)=>(e1)=>!e1._stopped && fn(e1)
            );
        } else {
            return value;
        }
    }
    const nativeOnRE = /^on[a-z]/;
    const forcePatchProp = (_, key)=>key === 'value'
    ;
    const patchProp = (el, key, prevValue, nextValue, isSVG = false, prevChildren, parentComponent, parentSuspense, unmountChildren)=>{
        switch(key){
            case 'class':
                patchClass(el, nextValue, isSVG);
                break;
            case 'style':
                patchStyle(el, prevValue, nextValue);
                break;
            default:
                if (isOn(key)) {
                    if (!isModelListener(key)) {
                        patchEvent(el, key, prevValue, nextValue, parentComponent);
                    }
                } else if (shouldSetAsProp(el, key, nextValue, isSVG)) {
                    patchDOMProp(el, key, nextValue, prevChildren, parentComponent, parentSuspense, unmountChildren);
                } else {
                    if (key === 'true-value') {
                        el._trueValue = nextValue;
                    } else if (key === 'false-value') {
                        el._falseValue = nextValue;
                    }
                    patchAttr(el, key, nextValue, isSVG);
                }
                break;
        }
    };
    function shouldSetAsProp(el, key, value, isSVG) {
        if (isSVG) {
            if (key === 'innerHTML') {
                return true;
            }
            if (key in el && /^on[a-z]/.test(key) && isFunction(value)) {
                return true;
            }
            return false;
        }
        if (key === 'spellcheck' || key === 'draggable') {
            return false;
        }
        if (key === 'form' && typeof value === 'string') {
            return false;
        }
        if (key === 'list' && el.tagName === 'INPUT') {
            return false;
        }
        if (/^on[a-z]/.test(key) && isString(value)) {
            return false;
        }
        return key in el;
    }
    function useCssModule(name = '$style') {
        {
            {
                warn(`useCssModule() is not supported in the global build.`);
            }
            return EMPTY_OBJ;
        }
    }
    function useCssVars(getter1, scoped = false) {
        const instance = getCurrentInstance();
        if (!instance) {
            warn(`useCssVars is called without current active component instance.`);
            return;
        }
        const prefix = scoped && instance.type.__scopeId ? `${instance.type.__scopeId.replace(/^data-v-/, '')}-` : ``;
        const setVars = ()=>setVarsOnVNode(instance.subTree, getter1(instance.proxy), prefix)
        ;
        onMounted(()=>watchEffect(setVars)
        );
        onUpdated(setVars);
    }
    function setVarsOnVNode(vnode, vars, prefix) {
        if (vnode.shapeFlag & 128) {
            const suspense = vnode.suspense;
            vnode = suspense.activeBranch;
            if (suspense.pendingBranch && !suspense.isHydrating) {
                suspense.effects.push(()=>{
                    setVarsOnVNode(suspense.activeBranch, vars, prefix);
                });
            }
        }
        while(vnode.component){
            vnode = vnode.component.subTree;
        }
        if (vnode.shapeFlag & 1 && vnode.el) {
            const style = vnode.el.style;
            for(const key in vars){
                style.setProperty(`--${prefix}${key}`, unref(vars[key]));
            }
        } else if (vnode.type === Fragment) {
            vnode.children.forEach((c)=>setVarsOnVNode(c, vars, prefix)
            );
        }
    }
    const TRANSITION = 'transition';
    const ANIMATION = 'animation';
    const Transition = (props, { slots  })=>h(BaseTransitionImpl, resolveTransitionProps(props), slots)
    ;
    Transition.displayName = 'Transition';
    const DOMTransitionPropsValidators = {
        name: String,
        type: String,
        css: {
            type: Boolean,
            default: true
        },
        duration: [
            String,
            Number,
            Object
        ],
        enterFromClass: String,
        enterActiveClass: String,
        enterToClass: String,
        appearFromClass: String,
        appearActiveClass: String,
        appearToClass: String,
        leaveFromClass: String,
        leaveActiveClass: String,
        leaveToClass: String
    };
    const TransitionPropsValidators = Transition.props = extend({
    }, BaseTransitionImpl.props, DOMTransitionPropsValidators);
    function resolveTransitionProps(rawProps) {
        let { name ='v' , type , css =true , duration , enterFromClass =`${name}-enter-from` , enterActiveClass =`${name}-enter-active` , enterToClass =`${name}-enter-to` , appearFromClass =enterFromClass , appearActiveClass =enterActiveClass , appearToClass =enterToClass , leaveFromClass =`${name}-leave-from` , leaveActiveClass =`${name}-leave-active` , leaveToClass =`${name}-leave-to`  } = rawProps;
        const baseProps = {
        };
        for(const key in rawProps){
            if (!(key in DOMTransitionPropsValidators)) {
                baseProps[key] = rawProps[key];
            }
        }
        if (!css) {
            return baseProps;
        }
        const durations = normalizeDuration(duration);
        const enterDuration = durations && durations[0];
        const leaveDuration = durations && durations[1];
        const { onBeforeEnter , onEnter , onEnterCancelled , onLeave , onLeaveCancelled , onBeforeAppear =onBeforeEnter , onAppear =onEnter , onAppearCancelled =onEnterCancelled  } = baseProps;
        const finishEnter = (el, isAppear, done)=>{
            removeTransitionClass(el, isAppear ? appearToClass : enterToClass);
            removeTransitionClass(el, isAppear ? appearActiveClass : enterActiveClass);
            done && done();
        };
        const finishLeave = (el, done)=>{
            removeTransitionClass(el, leaveToClass);
            removeTransitionClass(el, leaveActiveClass);
            done && done();
        };
        const makeEnterHook = (isAppear)=>{
            return (el, done)=>{
                const hook = isAppear ? onAppear : onEnter;
                const resolve1 = ()=>finishEnter(el, isAppear, done)
                ;
                hook && hook(el, resolve1);
                nextFrame(()=>{
                    removeTransitionClass(el, isAppear ? appearFromClass : enterFromClass);
                    addTransitionClass(el, isAppear ? appearToClass : enterToClass);
                    if (!(hook && hook.length > 1)) {
                        if (enterDuration) {
                            setTimeout(resolve1, enterDuration);
                        } else {
                            whenTransitionEnds(el, type, resolve1);
                        }
                    }
                });
            };
        };
        return extend(baseProps, {
            onBeforeEnter (el) {
                onBeforeEnter && onBeforeEnter(el);
                addTransitionClass(el, enterActiveClass);
                addTransitionClass(el, enterFromClass);
            },
            onBeforeAppear (el) {
                onBeforeAppear && onBeforeAppear(el);
                addTransitionClass(el, appearActiveClass);
                addTransitionClass(el, appearFromClass);
            },
            onEnter: makeEnterHook(false),
            onAppear: makeEnterHook(true),
            onLeave (el, done) {
                const resolve1 = ()=>finishLeave(el, done)
                ;
                addTransitionClass(el, leaveActiveClass);
                addTransitionClass(el, leaveFromClass);
                nextFrame(()=>{
                    removeTransitionClass(el, leaveFromClass);
                    addTransitionClass(el, leaveToClass);
                    if (!(onLeave && onLeave.length > 1)) {
                        if (leaveDuration) {
                            setTimeout(resolve1, leaveDuration);
                        } else {
                            whenTransitionEnds(el, type, resolve1);
                        }
                    }
                });
                onLeave && onLeave(el, resolve1);
            },
            onEnterCancelled (el) {
                finishEnter(el, false);
                onEnterCancelled && onEnterCancelled(el);
            },
            onAppearCancelled (el) {
                finishEnter(el, true);
                onAppearCancelled && onAppearCancelled(el);
            },
            onLeaveCancelled (el) {
                finishLeave(el);
                onLeaveCancelled && onLeaveCancelled(el);
            }
        });
    }
    function normalizeDuration(duration) {
        if (duration == null) {
            return null;
        } else if (isObject(duration)) {
            return [
                NumberOf(duration.enter),
                NumberOf(duration.leave)
            ];
        } else {
            const n = NumberOf(duration);
            return [
                n,
                n
            ];
        }
    }
    function NumberOf(val) {
        const res = toNumber(val);
        validateDuration(res);
        return res;
    }
    function validateDuration(val) {
        if (typeof val !== 'number') {
            warn(`<transition> explicit duration is not a valid number - ` + `got ${JSON.stringify(val)}.`);
        } else if (isNaN(val)) {
            warn(`<transition> explicit duration is NaN - ` + 'the duration expression might be incorrect.');
        }
    }
    function addTransitionClass(el, cls) {
        cls.split(/\s+/).forEach((c)=>c && el.classList.add(c)
        );
        (el._vtc || (el._vtc = new Set())).add(cls);
    }
    function removeTransitionClass(el, cls) {
        cls.split(/\s+/).forEach((c)=>c && el.classList.remove(c)
        );
        const { _vtc  } = el;
        if (_vtc) {
            _vtc.delete(cls);
            if (!_vtc.size) {
                el._vtc = undefined;
            }
        }
    }
    function nextFrame(cb) {
        requestAnimationFrame(()=>{
            requestAnimationFrame(cb);
        });
    }
    function whenTransitionEnds(el, expectedType, cb) {
        const { type , timeout , propCount  } = getTransitionInfo(el, expectedType);
        if (!type) {
            return cb();
        }
        const endEvent = type + 'end';
        let ended = 0;
        const end = ()=>{
            el.removeEventListener(endEvent, onEnd);
            cb();
        };
        const onEnd = (e)=>{
            if (e.target === el) {
                if ((++ended) >= propCount) {
                    end();
                }
            }
        };
        setTimeout(()=>{
            if (ended < propCount) {
                end();
            }
        }, timeout + 1);
        el.addEventListener(endEvent, onEnd);
    }
    function getTransitionInfo(el, expectedType) {
        const styles = window.getComputedStyle(el);
        const getStyleProperties = (key)=>(styles[key] || '').split(', ')
        ;
        const transitionDelays = getStyleProperties('transition' + 'Delay');
        const transitionDurations = getStyleProperties('transition' + 'Duration');
        const transitionTimeout = getTimeout(transitionDelays, transitionDurations);
        const animationDelays = getStyleProperties('animation' + 'Delay');
        const animationDurations = getStyleProperties('animation' + 'Duration');
        const animationTimeout = getTimeout(animationDelays, animationDurations);
        let type = null;
        let timeout = 0;
        let propCount = 0;
        if (expectedType === 'transition') {
            if (transitionTimeout > 0) {
                type = 'transition';
                timeout = transitionTimeout;
                propCount = transitionDurations.length;
            }
        } else if (expectedType === 'animation') {
            if (animationTimeout > 0) {
                type = 'animation';
                timeout = animationTimeout;
                propCount = animationDurations.length;
            }
        } else {
            timeout = Math.max(transitionTimeout, animationTimeout);
            type = timeout > 0 ? transitionTimeout > animationTimeout ? 'transition' : 'animation' : null;
            propCount = type ? type === 'transition' ? transitionDurations.length : animationDurations.length : 0;
        }
        const hasTransform = type === 'transition' && /\b(transform|all)(,|$)/.test(styles['transition' + 'Property']);
        return {
            type,
            timeout,
            propCount,
            hasTransform
        };
    }
    function getTimeout(delays, durations) {
        while(delays.length < durations.length){
            delays = delays.concat(delays);
        }
        return Math.max(...durations.map((d, i)=>toMs(d) + toMs(delays[i])
        ));
    }
    function toMs(s) {
        return Number(s.slice(0, -1).replace(',', '.')) * 1000;
    }
    const positionMap = new WeakMap();
    const newPositionMap = new WeakMap();
    const TransitionGroupImpl = {
        name: 'TransitionGroup',
        props: extend({
        }, TransitionPropsValidators, {
            tag: String,
            moveClass: String
        }),
        setup (props, { slots  }) {
            const instance = getCurrentInstance();
            const state = useTransitionState();
            let prevChildren;
            let children;
            onUpdated(()=>{
                if (!prevChildren.length) {
                    return;
                }
                const moveClass = props.moveClass || `${props.name || 'v'}-move`;
                if (!hasCSSTransform(prevChildren[0].el, instance.vnode.el, moveClass)) {
                    return;
                }
                prevChildren.forEach(callPendingCbs);
                prevChildren.forEach(recordPosition);
                const movedChildren = prevChildren.filter(applyTranslation);
                forceReflow();
                movedChildren.forEach((c)=>{
                    const el = c.el;
                    const style = el.style;
                    addTransitionClass(el, moveClass);
                    style.transform = style.webkitTransform = style.transitionDuration = '';
                    const cb = el._moveCb = (e)=>{
                        if (e && e.target !== el) {
                            return;
                        }
                        if (!e || /transform$/.test(e.propertyName)) {
                            el.removeEventListener('transitionend', cb);
                            el._moveCb = null;
                            removeTransitionClass(el, moveClass);
                        }
                    };
                    el.addEventListener('transitionend', cb);
                });
            });
            return ()=>{
                const rawProps = toRaw(props);
                const cssTransitionProps = resolveTransitionProps(rawProps);
                const tag = rawProps.tag || Fragment;
                prevChildren = children;
                children = slots.default ? getTransitionRawChildren(slots.default()) : [];
                for(let i = 0; i < children.length; i++){
                    const child = children[i];
                    if (child.key != null) {
                        setTransitionHooks(child, resolveTransitionHooks(child, cssTransitionProps, state, instance));
                    } else {
                        warn(`<TransitionGroup> children must be keyed.`);
                    }
                }
                if (prevChildren) {
                    for(let i1 = 0; i1 < prevChildren.length; i1++){
                        const child = prevChildren[i1];
                        setTransitionHooks(child, resolveTransitionHooks(child, cssTransitionProps, state, instance));
                        positionMap.set(child, child.el.getBoundingClientRect());
                    }
                }
                return createVNodeWithArgsTransform(tag, null, children);
            };
        }
    };
    const TransitionGroup = TransitionGroupImpl;
    function callPendingCbs(c) {
        const el = c.el;
        if (el._moveCb) {
            el._moveCb();
        }
        if (el._enterCb) {
            el._enterCb();
        }
    }
    function recordPosition(c) {
        newPositionMap.set(c, c.el.getBoundingClientRect());
    }
    function applyTranslation(c) {
        const oldPos = positionMap.get(c);
        const newPos = newPositionMap.get(c);
        const dx = oldPos.left - newPos.left;
        const dy = oldPos.top - newPos.top;
        if (dx || dy) {
            const s = c.el.style;
            s.transform = s.webkitTransform = `translate(${dx}px,${dy}px)`;
            s.transitionDuration = '0s';
            return c;
        }
    }
    function forceReflow() {
        return document.body.offsetHeight;
    }
    function hasCSSTransform(el, root, moveClass) {
        const clone = el.cloneNode();
        if (el._vtc) {
            el._vtc.forEach((cls)=>{
                cls.split(/\s+/).forEach((c)=>c && clone.classList.remove(c)
                );
            });
        }
        moveClass.split(/\s+/).forEach((c)=>c && clone.classList.add(c)
        );
        clone.style.display = 'none';
        const container = root.nodeType === 1 ? root : root.parentNode;
        container.appendChild(clone);
        const { hasTransform  } = getTransitionInfo(clone);
        container.removeChild(clone);
        return hasTransform;
    }
    const getModelAssigner = (vnode)=>{
        const fn = vnode.props['onUpdate:modelValue'];
        return isArray(fn) ? (value)=>invokeArrayFns(fn, value)
         : fn;
    };
    function onCompositionStart(e) {
        e.target.composing = true;
    }
    function onCompositionEnd(e) {
        const target = e.target;
        if (target.composing) {
            target.composing = false;
            trigger$1(target, 'input');
        }
    }
    function trigger$1(el, type) {
        const e = document.createEvent('HTMLEvents');
        e.initEvent(type, true, true);
        el.dispatchEvent(e);
    }
    const vModelText = {
        created (el, { modifiers: { lazy , trim , number  }  }, vnode) {
            el._assign = getModelAssigner(vnode);
            const castToNumber = number || el.type === 'number';
            addEventListener(el, lazy ? 'change' : 'input', (e)=>{
                if (e.target.composing) return;
                let domValue = el.value;
                if (trim) {
                    domValue = domValue.trim();
                } else if (castToNumber) {
                    domValue = toNumber(domValue);
                }
                el._assign(domValue);
            });
            if (trim) {
                addEventListener(el, 'change', ()=>{
                    el.value = el.value.trim();
                });
            }
            if (!lazy) {
                addEventListener(el, 'compositionstart', onCompositionStart);
                addEventListener(el, 'compositionend', onCompositionEnd);
                addEventListener(el, 'change', onCompositionEnd);
            }
        },
        mounted (el, { value  }) {
            el.value = value == null ? '' : value;
        },
        beforeUpdate (el, { value , modifiers: { trim , number  }  }, vnode) {
            el._assign = getModelAssigner(vnode);
            if (el.composing) return;
            if (document.activeElement === el) {
                if (trim && el.value.trim() === value) {
                    return;
                }
                if ((number || el.type === 'number') && toNumber(el.value) === value) {
                    return;
                }
            }
            const newValue = value == null ? '' : value;
            if (el.value !== newValue) {
                el.value = newValue;
            }
        }
    };
    const vModelCheckbox = {
        created (el, binding, vnode) {
            setChecked(el, binding, vnode);
            el._assign = getModelAssigner(vnode);
            addEventListener(el, 'change', ()=>{
                const modelValue = el._modelValue;
                const elementValue = getValue(el);
                const checked = el.checked;
                const assign = el._assign;
                if (isArray(modelValue)) {
                    const index = looseIndexOf(modelValue, elementValue);
                    const found = index !== -1;
                    if (checked && !found) {
                        assign(modelValue.concat(elementValue));
                    } else if (!checked && found) {
                        const filtered = [
                            ...modelValue
                        ];
                        filtered.splice(index, 1);
                        assign(filtered);
                    }
                } else if (isSet(modelValue)) {
                    if (checked) {
                        modelValue.add(elementValue);
                    } else {
                        modelValue.delete(elementValue);
                    }
                } else {
                    assign(getCheckboxValue(el, checked));
                }
            });
        },
        beforeUpdate (el, binding, vnode) {
            el._assign = getModelAssigner(vnode);
            setChecked(el, binding, vnode);
        }
    };
    function setChecked(el, { value , oldValue  }, vnode) {
        el._modelValue = value;
        if (isArray(value)) {
            el.checked = looseIndexOf(value, vnode.props.value) > -1;
        } else if (isSet(value)) {
            el.checked = value.has(vnode.props.value);
        } else if (value !== oldValue) {
            el.checked = looseEqual(value, getCheckboxValue(el, true));
        }
    }
    const vModelRadio = {
        created (el, { value  }, vnode) {
            el.checked = looseEqual(value, vnode.props.value);
            el._assign = getModelAssigner(vnode);
            addEventListener(el, 'change', ()=>{
                el._assign(getValue(el));
            });
        },
        beforeUpdate (el, { value , oldValue  }, vnode) {
            el._assign = getModelAssigner(vnode);
            if (value !== oldValue) {
                el.checked = looseEqual(value, vnode.props.value);
            }
        }
    };
    const vModelSelect = {
        created (el, { modifiers: { number  }  }, vnode) {
            addEventListener(el, 'change', ()=>{
                const selectedVal = Array.prototype.filter.call(el.options, (o)=>o.selected
                ).map((o)=>number ? toNumber(getValue(o)) : getValue(o)
                );
                el._assign(el.multiple ? selectedVal : selectedVal[0]);
            });
            el._assign = getModelAssigner(vnode);
        },
        mounted (el, { value  }) {
            setSelected(el, value);
        },
        beforeUpdate (el, _binding, vnode) {
            el._assign = getModelAssigner(vnode);
        },
        updated (el, { value  }) {
            setSelected(el, value);
        }
    };
    function setSelected(el, value) {
        const isMultiple = el.multiple;
        if (isMultiple && !isArray(value) && !isSet(value)) {
            warn(`<select multiple v-model> expects an Array or Set value for its binding, ` + `but got ${Object.prototype.toString.call(value).slice(8, -1)}.`);
            return;
        }
        for(let i = 0, l = el.options.length; i < l; i++){
            const option = el.options[i];
            const optionValue = getValue(option);
            if (isMultiple) {
                if (isArray(value)) {
                    option.selected = looseIndexOf(value, optionValue) > -1;
                } else {
                    option.selected = value.has(optionValue);
                }
            } else {
                if (looseEqual(getValue(option), value)) {
                    el.selectedIndex = i;
                    return;
                }
            }
        }
        if (!isMultiple) {
            el.selectedIndex = -1;
        }
    }
    function getValue(el) {
        return '_value' in el ? el._value : el.value;
    }
    function getCheckboxValue(el, checked) {
        const key = checked ? '_trueValue' : '_falseValue';
        return key in el ? el[key] : checked;
    }
    const vModelDynamic = {
        created (el, binding, vnode) {
            callModelHook(el, binding, vnode, null, 'created');
        },
        mounted (el, binding, vnode) {
            callModelHook(el, binding, vnode, null, 'mounted');
        },
        beforeUpdate (el, binding, vnode, prevVNode) {
            callModelHook(el, binding, vnode, prevVNode, 'beforeUpdate');
        },
        updated (el, binding, vnode, prevVNode) {
            callModelHook(el, binding, vnode, prevVNode, 'updated');
        }
    };
    function callModelHook(el, binding, vnode, prevVNode, hook) {
        let modelToUse;
        switch(el.tagName){
            case 'SELECT':
                modelToUse = vModelSelect;
                break;
            case 'TEXTAREA':
                modelToUse = vModelText;
                break;
            default:
                switch(vnode.props && vnode.props.type){
                    case 'checkbox':
                        modelToUse = vModelCheckbox;
                        break;
                    case 'radio':
                        modelToUse = vModelRadio;
                        break;
                    default:
                        modelToUse = vModelText;
                }
        }
        const fn = modelToUse[hook];
        fn && fn(el, binding, vnode, prevVNode);
    }
    const systemModifiers = [
        'ctrl',
        'shift',
        'alt',
        'meta'
    ];
    const modifierGuards = {
        stop: (e)=>e.stopPropagation()
        ,
        prevent: (e)=>e.preventDefault()
        ,
        self: (e)=>e.target !== e.currentTarget
        ,
        ctrl: (e)=>!e.ctrlKey
        ,
        shift: (e)=>!e.shiftKey
        ,
        alt: (e)=>!e.altKey
        ,
        meta: (e)=>!e.metaKey
        ,
        left: (e)=>'button' in e && e.button !== 0
        ,
        middle: (e)=>'button' in e && e.button !== 1
        ,
        right: (e)=>'button' in e && e.button !== 2
        ,
        exact: (e, modifiers)=>systemModifiers.some((m)=>e[`${m}Key`] && !modifiers.includes(m)
            )
    };
    const withModifiers = (fn, modifiers)=>{
        return (event, ...args)=>{
            for(let i = 0; i < modifiers.length; i++){
                const guard = modifierGuards[modifiers[i]];
                if (guard && guard(event, modifiers)) return;
            }
            return fn(event, ...args);
        };
    };
    const keyNames = {
        esc: 'escape',
        space: ' ',
        up: 'arrow-up',
        left: 'arrow-left',
        right: 'arrow-right',
        down: 'arrow-down',
        delete: 'backspace'
    };
    const withKeys = (fn, modifiers)=>{
        return (event)=>{
            if (!('key' in event)) return;
            const eventKey = hyphenate(event.key);
            if (!modifiers.some((k)=>k === eventKey || keyNames[k] === eventKey
            )) {
                return;
            }
            return fn(event);
        };
    };
    const vShow = {
        beforeMount (el, { value  }, { transition  }) {
            el._vod = el.style.display === 'none' ? '' : el.style.display;
            if (transition && value) {
                transition.beforeEnter(el);
            } else {
                setDisplay(el, value);
            }
        },
        mounted (el, { value  }, { transition  }) {
            if (transition && value) {
                transition.enter(el);
            }
        },
        updated (el, { value , oldValue  }, { transition  }) {
            if (!value === !oldValue) return;
            if (transition) {
                if (value) {
                    transition.beforeEnter(el);
                    setDisplay(el, true);
                    transition.enter(el);
                } else {
                    transition.leave(el, ()=>{
                        setDisplay(el, false);
                    });
                }
            } else {
                setDisplay(el, value);
            }
        },
        beforeUnmount (el, { value  }) {
            setDisplay(el, value);
        }
    };
    function setDisplay(el, value) {
        el.style.display = value ? el._vod : 'none';
    }
    const rendererOptions = extend({
        patchProp,
        forcePatchProp
    }, nodeOps);
    let renderer;
    let enabledHydration = false;
    function ensureRenderer() {
        return renderer || (renderer = createRenderer(rendererOptions));
    }
    function ensureHydrationRenderer() {
        renderer = enabledHydration ? renderer : createHydrationRenderer(rendererOptions);
        enabledHydration = true;
        return renderer;
    }
    const render = (...args)=>{
        ensureRenderer().render(...args);
    };
    const hydrate = (...args)=>{
        ensureHydrationRenderer().hydrate(...args);
    };
    const createApp = (...args)=>{
        const app = ensureRenderer().createApp(...args);
        {
            injectNativeTagCheck(app);
        }
        const { mount  } = app;
        app.mount = (containerOrSelector)=>{
            const container = normalizeContainer(containerOrSelector);
            if (!container) return;
            const component = app._component;
            if (!isFunction(component) && !component.render && !component.template) {
                component.template = container.innerHTML;
            }
            container.innerHTML = '';
            const proxy = mount(container);
            container.removeAttribute('v-cloak');
            container.setAttribute('data-v-app', '');
            return proxy;
        };
        return app;
    };
    const createSSRApp = (...args)=>{
        const app = ensureHydrationRenderer().createApp(...args);
        {
            injectNativeTagCheck(app);
        }
        const { mount  } = app;
        app.mount = (containerOrSelector)=>{
            const container = normalizeContainer(containerOrSelector);
            if (container) {
                return mount(container, true);
            }
        };
        return app;
    };
    function injectNativeTagCheck(app) {
        Object.defineProperty(app.config, 'isNativeTag', {
            value: (tag)=>isHTMLTag(tag) || isSVGTag(tag)
            ,
            writable: false
        });
    }
    function normalizeContainer(container) {
        if (isString(container)) {
            const res = document.querySelector(container);
            if (!res) {
                warn(`Failed to mount app: mount target selector returned null.`);
            }
            return res;
        }
        return container;
    }
    function initDev() {
        const target = getGlobalThis();
        target.__VUE__ = true;
        setDevtoolsHook(target.__VUE_DEVTOOLS_GLOBAL_HOOK__);
        {
            console.info(`You are running a development build of Vue.\n` + `Make sure to use the production build (*.prod.js) when deploying for production.`);
            initCustomFormatter();
        }
    }
    function defaultOnError(error) {
        throw error;
    }
    function createCompilerError(code, loc, messages, additionalMessage) {
        const msg = (messages || errorMessages)[code] + (additionalMessage || ``);
        const error = new SyntaxError(String(msg));
        error.code = code;
        error.loc = loc;
        return error;
    }
    const errorMessages = {
        [0]: 'Illegal comment.',
        [1]: 'CDATA section is allowed only in XML context.',
        [2]: 'Duplicate attribute.',
        [3]: 'End tag cannot have attributes.',
        [4]: "Illegal \'/\' in tags.",
        [5]: 'Unexpected EOF in tag.',
        [6]: 'Unexpected EOF in CDATA section.',
        [7]: 'Unexpected EOF in comment.',
        [8]: 'Unexpected EOF in script.',
        [9]: 'Unexpected EOF in tag.',
        [10]: 'Incorrectly closed comment.',
        [11]: 'Incorrectly opened comment.',
        [12]: "Illegal tag name. Use \'&lt;\' to print \'<\'.",
        [13]: 'Attribute value was expected.',
        [14]: 'End tag name was expected.',
        [15]: 'Whitespace was expected.',
        [16]: "Unexpected \'<!--\' in comment.",
        [17]: 'Attribute name cannot contain U+0022 (\"), U+0027 (\'), and U+003C (<).',
        [18]: 'Unquoted attribute value cannot contain U+0022 (\"), U+0027 (\'), U+003C (<), U+003D (=), and U+0060 (`).',
        [19]: "Attribute name cannot start with \'=\'.",
        [21]: "\'<?\' is allowed only in XML context.",
        [22]: "Illegal \'/\' in tags.",
        [23]: 'Invalid end tag.',
        [24]: 'Element is missing end tag.',
        [25]: 'Interpolation end sign was not found.',
        [26]: 'End bracket for dynamic directive argument was not found. ' + 'Note that dynamic directive argument cannot contain spaces.',
        [27]: `v-if/v-else-if is missing expression.`,
        [28]: `v-if/else branches must use unique keys.`,
        [29]: `v-else/v-else-if has no adjacent v-if.`,
        [30]: `v-for is missing expression.`,
        [31]: `v-for has invalid expression.`,
        [32]: `<template v-for> key should be placed on the <template> tag.`,
        [33]: `v-bind is missing expression.`,
        [34]: `v-on is missing expression.`,
        [35]: `Unexpected custom directive on <slot> outlet.`,
        [36]: `Mixed v-slot usage on both the component and nested <template>.` + `When there are multiple named slots, all slots should use <template> ` + `syntax to avoid scope ambiguity.`,
        [37]: `Duplicate slot names found. `,
        [38]: `Extraneous children found when component already has explicitly named ` + `default slot. These children will be ignored.`,
        [39]: `v-slot can only be used on components or <template> tags.`,
        [40]: `v-model is missing expression.`,
        [41]: `v-model value must be a valid JavaScript member expression.`,
        [42]: `v-model cannot be used on v-for or v-slot scope variables because they are not writable.`,
        [43]: `Error parsing JavaScript expression: `,
        [44]: `<KeepAlive> expects exactly one child component.`,
        [45]: `"prefixIdentifiers" option is not supported in this build of compiler.`,
        [46]: `ES module mode is not supported in this build of compiler.`,
        [47]: `"cacheHandlers" option is only supported when the "prefixIdentifiers" option is enabled.`,
        [48]: `"scopeId" option is only supported in module mode.`
    };
    const FRAGMENT = Symbol(`Fragment`);
    const TELEPORT = Symbol(`Teleport`);
    const SUSPENSE = Symbol(`Suspense`);
    const KEEP_ALIVE = Symbol(`KeepAlive`);
    const BASE_TRANSITION = Symbol(`BaseTransition`);
    const OPEN_BLOCK = Symbol(`openBlock`);
    const CREATE_BLOCK = Symbol(`createBlock`);
    const CREATE_VNODE = Symbol(`createVNode`);
    const CREATE_COMMENT = Symbol(`createCommentVNode`);
    const CREATE_TEXT = Symbol(`createTextVNode`);
    const CREATE_STATIC = Symbol(`createStaticVNode`);
    const RESOLVE_COMPONENT = Symbol(`resolveComponent`);
    const RESOLVE_DYNAMIC_COMPONENT = Symbol(`resolveDynamicComponent`);
    const RESOLVE_DIRECTIVE = Symbol(`resolveDirective`);
    const WITH_DIRECTIVES = Symbol(`withDirectives`);
    const RENDER_LIST = Symbol(`renderList`);
    const RENDER_SLOT = Symbol(`renderSlot`);
    const CREATE_SLOTS = Symbol(`createSlots`);
    const TO_DISPLAY_STRING = Symbol(`toDisplayString`);
    const MERGE_PROPS = Symbol(`mergeProps`);
    const TO_HANDLERS = Symbol(`toHandlers`);
    const CAMELIZE = Symbol(`camelize`);
    const CAPITALIZE = Symbol(`capitalize`);
    const TO_HANDLER_KEY = Symbol(`toHandlerKey`);
    const SET_BLOCK_TRACKING = Symbol(`setBlockTracking`);
    const PUSH_SCOPE_ID = Symbol(`pushScopeId`);
    const POP_SCOPE_ID = Symbol(`popScopeId`);
    const WITH_SCOPE_ID = Symbol(`withScopeId`);
    const WITH_CTX = Symbol(`withCtx`);
    const helperNameMap = {
        [FRAGMENT]: `Fragment`,
        [TELEPORT]: `Teleport`,
        [SUSPENSE]: `Suspense`,
        [KEEP_ALIVE]: `KeepAlive`,
        [BASE_TRANSITION]: `BaseTransition`,
        [OPEN_BLOCK]: `openBlock`,
        [CREATE_BLOCK]: `createBlock`,
        [CREATE_VNODE]: `createVNode`,
        [CREATE_COMMENT]: `createCommentVNode`,
        [CREATE_TEXT]: `createTextVNode`,
        [CREATE_STATIC]: `createStaticVNode`,
        [RESOLVE_COMPONENT]: `resolveComponent`,
        [RESOLVE_DYNAMIC_COMPONENT]: `resolveDynamicComponent`,
        [RESOLVE_DIRECTIVE]: `resolveDirective`,
        [WITH_DIRECTIVES]: `withDirectives`,
        [RENDER_LIST]: `renderList`,
        [RENDER_SLOT]: `renderSlot`,
        [CREATE_SLOTS]: `createSlots`,
        [TO_DISPLAY_STRING]: `toDisplayString`,
        [MERGE_PROPS]: `mergeProps`,
        [TO_HANDLERS]: `toHandlers`,
        [CAMELIZE]: `camelize`,
        [CAPITALIZE]: `capitalize`,
        [TO_HANDLER_KEY]: `toHandlerKey`,
        [SET_BLOCK_TRACKING]: `setBlockTracking`,
        [PUSH_SCOPE_ID]: `pushScopeId`,
        [POP_SCOPE_ID]: `popScopeId`,
        [WITH_SCOPE_ID]: `withScopeId`,
        [WITH_CTX]: `withCtx`
    };
    function registerRuntimeHelpers(helpers) {
        Object.getOwnPropertySymbols(helpers).forEach((s)=>{
            helperNameMap[s] = helpers[s];
        });
    }
    const locStub = {
        source: '',
        start: {
            line: 1,
            column: 1,
            offset: 0
        },
        end: {
            line: 1,
            column: 1,
            offset: 0
        }
    };
    function createRoot(children, loc = locStub) {
        return {
            type: 0,
            children,
            helpers: [],
            components: [],
            directives: [],
            hoists: [],
            imports: [],
            cached: 0,
            temps: 0,
            codegenNode: undefined,
            loc
        };
    }
    function createVNodeCall(context, tag, props, children, patchFlag, dynamicProps, directives, isBlock = false, disableTracking = false, loc = locStub) {
        if (context) {
            if (isBlock) {
                context.helper(OPEN_BLOCK);
                context.helper(CREATE_BLOCK);
            } else {
                context.helper(CREATE_VNODE);
            }
            if (directives) {
                context.helper(WITH_DIRECTIVES);
            }
        }
        return {
            type: 13,
            tag,
            props,
            children,
            patchFlag,
            dynamicProps,
            directives,
            isBlock,
            disableTracking,
            loc
        };
    }
    function createArrayExpression(elements, loc = locStub) {
        return {
            type: 17,
            loc,
            elements
        };
    }
    function createObjectExpression(properties, loc = locStub) {
        return {
            type: 15,
            loc,
            properties
        };
    }
    function createObjectProperty(key, value) {
        return {
            type: 16,
            loc: locStub,
            key: isString(key) ? createSimpleExpression(key, true) : key,
            value
        };
    }
    function createSimpleExpression(content, isStatic, loc = locStub, isConstant = false) {
        return {
            type: 4,
            loc,
            isConstant,
            content,
            isStatic
        };
    }
    function createCompoundExpression(children, loc = locStub) {
        return {
            type: 8,
            loc,
            children
        };
    }
    function createCallExpression(callee, args = [], loc = locStub) {
        return {
            type: 14,
            loc,
            callee,
            arguments: args
        };
    }
    function createFunctionExpression(params, returns = undefined, newline = false, isSlot = false, loc = locStub) {
        return {
            type: 18,
            params,
            returns,
            newline,
            isSlot,
            loc
        };
    }
    function createConditionalExpression(test, consequent, alternate, newline = true) {
        return {
            type: 19,
            test,
            consequent,
            alternate,
            newline,
            loc: locStub
        };
    }
    function createCacheExpression(index, value, isVNode1 = false) {
        return {
            type: 20,
            index,
            value,
            isVNode: isVNode1,
            loc: locStub
        };
    }
    const isStaticExp = (p1)=>p1.type === 4 && p1.isStatic
    ;
    const isBuiltInType = (tag, expected)=>tag === expected || tag === hyphenate(expected)
    ;
    function isCoreComponent(tag) {
        if (isBuiltInType(tag, 'Teleport')) {
            return TELEPORT;
        } else if (isBuiltInType(tag, 'Suspense')) {
            return SUSPENSE;
        } else if (isBuiltInType(tag, 'KeepAlive')) {
            return KEEP_ALIVE;
        } else if (isBuiltInType(tag, 'BaseTransition')) {
            return BASE_TRANSITION;
        }
    }
    const nonIdentifierRE = /^\d|[^\$\w]/;
    const isSimpleIdentifier = (name)=>!/^\d|[^\$\w]/.test(name)
    ;
    const memberExpRE = /^[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*|\[[^\]]+\])*$/;
    const isMemberExpression = (path)=>{
        if (!path) return false;
        return /^[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*|\[[^\]]+\])*$/.test(path.trim());
    };
    function getInnerRange(loc, offset, length) {
        const source = loc.source.substr(offset, length);
        const newLoc = {
            source,
            start: advancePositionWithClone(loc.start, loc.source, offset),
            end: loc.end
        };
        if (length != null) {
            newLoc.end = advancePositionWithClone(loc.start, loc.source, offset + length);
        }
        return newLoc;
    }
    function advancePositionWithClone(pos, source, numberOfCharacters = source.length) {
        return advancePositionWithMutation(extend({
        }, pos), source, numberOfCharacters);
    }
    function advancePositionWithMutation(pos, source, numberOfCharacters = source.length) {
        let linesCount = 0;
        let lastNewLinePos = -1;
        for(let i = 0; i < numberOfCharacters; i++){
            if (source.charCodeAt(i) === 10) {
                linesCount++;
                lastNewLinePos = i;
            }
        }
        pos.offset += numberOfCharacters;
        pos.line += linesCount;
        pos.column = lastNewLinePos === -1 ? pos.column + numberOfCharacters : numberOfCharacters - lastNewLinePos;
        return pos;
    }
    function assert(condition, msg) {
        if (!condition) {
            throw new Error(msg || `unexpected compiler condition`);
        }
    }
    function findDir(node, name, allowEmpty = false) {
        for(let i = 0; i < node.props.length; i++){
            const p1 = node.props[i];
            if (p1.type === 7 && (allowEmpty || p1.exp) && (isString(name) ? p1.name === name : name.test(p1.name))) {
                return p1;
            }
        }
    }
    function findProp(node, name, dynamicOnly = false, allowEmpty = false) {
        for(let i = 0; i < node.props.length; i++){
            const p1 = node.props[i];
            if (p1.type === 6) {
                if (dynamicOnly) continue;
                if (p1.name === name && (p1.value || allowEmpty)) {
                    return p1;
                }
            } else if (p1.name === 'bind' && (p1.exp || allowEmpty) && isBindKey(p1.arg, name)) {
                return p1;
            }
        }
    }
    function isBindKey(arg, name) {
        return !!(arg && isStaticExp(arg) && arg.content === name);
    }
    function hasDynamicKeyVBind(node) {
        return node.props.some((p1)=>p1.type === 7 && p1.name === 'bind' && (!p1.arg || p1.arg.type !== 4 || !p1.arg.isStatic)
        );
    }
    function isText(node) {
        return node.type === 5 || node.type === 2;
    }
    function isVSlot(p1) {
        return p1.type === 7 && p1.name === 'slot';
    }
    function isTemplateNode(node) {
        return node.type === 1 && node.tagType === 3;
    }
    function isSlotOutlet(node) {
        return node.type === 1 && node.tagType === 2;
    }
    function injectProp(node, prop, context) {
        let propsWithInjection;
        const props = node.type === 13 ? node.props : node.arguments[2];
        if (props == null || isString(props)) {
            propsWithInjection = createObjectExpression([
                prop
            ]);
        } else if (props.type === 14) {
            const first = props.arguments[0];
            if (!isString(first) && first.type === 15) {
                first.properties.unshift(prop);
            } else {
                if (props.callee === TO_HANDLERS) {
                    propsWithInjection = createCallExpression(context.helper(MERGE_PROPS), [
                        createObjectExpression([
                            prop
                        ]),
                        props
                    ]);
                } else {
                    props.arguments.unshift(createObjectExpression([
                        prop
                    ]));
                }
            }
            !propsWithInjection && (propsWithInjection = props);
        } else if (props.type === 15) {
            let alreadyExists = false;
            if (prop.key.type === 4) {
                const propKeyName = prop.key.content;
                alreadyExists = props.properties.some((p1)=>p1.key.type === 4 && p1.key.content === propKeyName
                );
            }
            if (!alreadyExists) {
                props.properties.unshift(prop);
            }
            propsWithInjection = props;
        } else {
            propsWithInjection = createCallExpression(context.helper(MERGE_PROPS), [
                createObjectExpression([
                    prop
                ]),
                props
            ]);
        }
        if (node.type === 13) {
            node.props = propsWithInjection;
        } else {
            node.arguments[2] = propsWithInjection;
        }
    }
    function toValidAssetId(name, type) {
        return `_${type}_${name.replace(/[^\w]/g, '_')}`;
    }
    const decodeRE = /&(gt|lt|amp|apos|quot);/g;
    const decodeMap = {
        gt: '>',
        lt: '<',
        amp: '&',
        apos: "\'",
        quot: '\"'
    };
    const defaultParserOptions = {
        delimiters: [
            `{{`,
            `}}`
        ],
        getNamespace: ()=>0
        ,
        getTextMode: ()=>0
        ,
        isVoidTag: NO,
        isPreTag: NO,
        isCustomElement: NO,
        decodeEntities: (rawText)=>rawText.replace(/&(gt|lt|amp|apos|quot);/g, (_, p1)=>decodeMap[p1]
            )
        ,
        onError: defaultOnError,
        comments: false
    };
    function baseParse(content, options = {
    }) {
        const context = createParserContext(content, options);
        const start = getCursor(context);
        return createRoot(parseChildren(context, 0, []), getSelection(context, start));
    }
    function createParserContext(content, rawOptions) {
        const options = extend({
        }, defaultParserOptions);
        for(const key in rawOptions){
            options[key] = rawOptions[key] || defaultParserOptions[key];
        }
        return {
            options,
            column: 1,
            line: 1,
            offset: 0,
            originalSource: content,
            source: content,
            inPre: false,
            inVPre: false
        };
    }
    function parseChildren(context, mode, ancestors) {
        const parent = last(ancestors);
        const ns = parent ? parent.ns : 0;
        const nodes = [];
        while(!isEnd(context, mode, ancestors)){
            const s = context.source;
            let node = undefined;
            if (mode === 0 || mode === 1) {
                if (!context.inVPre && startsWith(s, context.options.delimiters[0])) {
                    node = parseInterpolation(context, mode);
                } else if (mode === 0 && s[0] === '<') {
                    if (s.length === 1) {
                        emitError(context, 5, 1);
                    } else if (s[1] === '!') {
                        if (startsWith(s, '<!--')) {
                            node = parseComment(context);
                        } else if (startsWith(s, '<!DOCTYPE')) {
                            node = parseBogusComment(context);
                        } else if (startsWith(s, '<![CDATA[')) {
                            if (ns !== 0) {
                                node = parseCDATA(context, ancestors);
                            } else {
                                emitError(context, 1);
                                node = parseBogusComment(context);
                            }
                        } else {
                            emitError(context, 11);
                            node = parseBogusComment(context);
                        }
                    } else if (s[1] === '/') {
                        if (s.length === 2) {
                            emitError(context, 5, 2);
                        } else if (s[2] === '>') {
                            emitError(context, 14, 2);
                            advanceBy(context, 3);
                            continue;
                        } else if (/[a-z]/i.test(s[2])) {
                            emitError(context, 23);
                            parseTag(context, 1, parent);
                            continue;
                        } else {
                            emitError(context, 12, 2);
                            node = parseBogusComment(context);
                        }
                    } else if (/[a-z]/i.test(s[1])) {
                        node = parseElement(context, ancestors);
                    } else if (s[1] === '?') {
                        emitError(context, 21, 1);
                        node = parseBogusComment(context);
                    } else {
                        emitError(context, 12, 1);
                    }
                }
            }
            if (!node) {
                node = parseText(context, mode);
            }
            if (isArray(node)) {
                for(let i = 0; i < node.length; i++){
                    pushNode(nodes, node[i]);
                }
            } else {
                pushNode(nodes, node);
            }
        }
        let removedWhitespace = false;
        if (mode !== 2) {
            for(let i = 0; i < nodes.length; i++){
                const node = nodes[i];
                if (!context.inPre && node.type === 2) {
                    if (!/[^\t\r\n\f ]/.test(node.content)) {
                        const prev = nodes[i - 1];
                        const next = nodes[i + 1];
                        if (!prev || !next || prev.type === 3 || next.type === 3 || prev.type === 1 && next.type === 1 && /[\r\n]/.test(node.content)) {
                            removedWhitespace = true;
                            nodes[i] = null;
                        } else {
                            node.content = ' ';
                        }
                    } else {
                        node.content = node.content.replace(/[\t\r\n\f ]+/g, ' ');
                    }
                }
            }
            if (context.inPre && parent && context.options.isPreTag(parent.tag)) {
                const first = nodes[0];
                if (first && first.type === 2) {
                    first.content = first.content.replace(/^\r?\n/, '');
                }
            }
        }
        return removedWhitespace ? nodes.filter(Boolean) : nodes;
    }
    function pushNode(nodes, node) {
        if (node.type === 2) {
            const prev = last(nodes);
            if (prev && prev.type === 2 && prev.loc.end.offset === node.loc.start.offset) {
                prev.content += node.content;
                prev.loc.end = node.loc.end;
                prev.loc.source += node.loc.source;
                return;
            }
        }
        nodes.push(node);
    }
    function parseCDATA(context, ancestors) {
        advanceBy(context, 9);
        const nodes = parseChildren(context, 3, ancestors);
        if (context.source.length === 0) {
            emitError(context, 6);
        } else {
            advanceBy(context, 3);
        }
        return nodes;
    }
    function parseComment(context) {
        const start = getCursor(context);
        let content;
        const match = /--(\!)?>/.exec(context.source);
        if (!match) {
            content = context.source.slice(4);
            advanceBy(context, context.source.length);
            emitError(context, 7);
        } else {
            if (match.index <= 3) {
                emitError(context, 0);
            }
            if (match[1]) {
                emitError(context, 10);
            }
            content = context.source.slice(4, match.index);
            const s = context.source.slice(0, match.index);
            let prevIndex = 1, nestedIndex = 0;
            while((nestedIndex = s.indexOf('<!--', prevIndex)) !== -1){
                advanceBy(context, nestedIndex - prevIndex + 1);
                if (nestedIndex + 4 < s.length) {
                    emitError(context, 16);
                }
                prevIndex = nestedIndex + 1;
            }
            advanceBy(context, match.index + match[0].length - prevIndex + 1);
        }
        return {
            type: 3,
            content,
            loc: getSelection(context, start)
        };
    }
    function parseBogusComment(context) {
        const start = getCursor(context);
        const contentStart = context.source[1] === '?' ? 1 : 2;
        let content;
        const closeIndex = context.source.indexOf('>');
        if (closeIndex === -1) {
            content = context.source.slice(contentStart);
            advanceBy(context, context.source.length);
        } else {
            content = context.source.slice(contentStart, closeIndex);
            advanceBy(context, closeIndex + 1);
        }
        return {
            type: 3,
            content,
            loc: getSelection(context, start)
        };
    }
    function parseElement(context, ancestors) {
        const wasInPre = context.inPre;
        const wasInVPre = context.inVPre;
        const parent = last(ancestors);
        const element = parseTag(context, 0, parent);
        const isPreBoundary = context.inPre && !wasInPre;
        const isVPreBoundary = context.inVPre && !wasInVPre;
        if (element.isSelfClosing || context.options.isVoidTag(element.tag)) {
            return element;
        }
        ancestors.push(element);
        const mode = context.options.getTextMode(element, parent);
        const children = parseChildren(context, mode, ancestors);
        ancestors.pop();
        element.children = children;
        if (startsWithEndTagOpen(context.source, element.tag)) {
            parseTag(context, 1, parent);
        } else {
            emitError(context, 24, 0, element.loc.start);
            if (context.source.length === 0 && element.tag.toLowerCase() === 'script') {
                const first = children[0];
                if (first && startsWith(first.loc.source, '<!--')) {
                    emitError(context, 8);
                }
            }
        }
        element.loc = getSelection(context, element.loc.start);
        if (isPreBoundary) {
            context.inPre = false;
        }
        if (isVPreBoundary) {
            context.inVPre = false;
        }
        return element;
    }
    const isSpecialTemplateDirective = makeMap(`if,else,else-if,for,slot`);
    function parseTag(context, type, parent) {
        const start = getCursor(context);
        const match = /^<\/?([a-z][^\t\r\n\f />]*)/i.exec(context.source);
        const tag = match[1];
        const ns = context.options.getNamespace(tag, parent);
        advanceBy(context, match[0].length);
        advanceSpaces(context);
        const cursor = getCursor(context);
        const currentSource = context.source;
        let props = parseAttributes(context, type);
        if (context.options.isPreTag(tag)) {
            context.inPre = true;
        }
        if (!context.inVPre && props.some((p1)=>p1.type === 7 && p1.name === 'pre'
        )) {
            context.inVPre = true;
            extend(context, cursor);
            context.source = currentSource;
            props = parseAttributes(context, type).filter((p1)=>p1.name !== 'v-pre'
            );
        }
        let isSelfClosing = false;
        if (context.source.length === 0) {
            emitError(context, 9);
        } else {
            isSelfClosing = startsWith(context.source, '/>');
            if (type === 1 && isSelfClosing) {
                emitError(context, 4);
            }
            advanceBy(context, isSelfClosing ? 2 : 1);
        }
        let tagType = 0;
        const options = context.options;
        if (!context.inVPre && !options.isCustomElement(tag)) {
            const hasVIs = props.some((p1)=>p1.type === 7 && p1.name === 'is'
            );
            if (options.isNativeTag && !hasVIs) {
                if (!options.isNativeTag(tag)) tagType = 1;
            } else if (hasVIs || isCoreComponent(tag) || options.isBuiltInComponent && options.isBuiltInComponent(tag) || /^[A-Z]/.test(tag) || tag === 'component') {
                tagType = 1;
            }
            if (tag === 'slot') {
                tagType = 2;
            } else if (tag === 'template' && props.some((p1)=>{
                return p1.type === 7 && isSpecialTemplateDirective(p1.name);
            })) {
                tagType = 3;
            }
        }
        return {
            type: 1,
            ns,
            tag,
            tagType,
            props,
            isSelfClosing,
            children: [],
            loc: getSelection(context, start),
            codegenNode: undefined
        };
    }
    function parseAttributes(context, type) {
        const props = [];
        const attributeNames = new Set();
        while(context.source.length > 0 && !startsWith(context.source, '>') && !startsWith(context.source, '/>')){
            if (startsWith(context.source, '/')) {
                emitError(context, 22);
                advanceBy(context, 1);
                advanceSpaces(context);
                continue;
            }
            if (type === 1) {
                emitError(context, 3);
            }
            const attr = parseAttribute(context, attributeNames);
            if (type === 0) {
                props.push(attr);
            }
            if (/^[^\t\r\n\f />]/.test(context.source)) {
                emitError(context, 15);
            }
            advanceSpaces(context);
        }
        return props;
    }
    function parseAttribute(context, nameSet) {
        const start = getCursor(context);
        const match = /^[^\t\r\n\f />][^\t\r\n\f />=]*/.exec(context.source);
        const name = match[0];
        if (nameSet.has(name)) {
            emitError(context, 2);
        }
        nameSet.add(name);
        if (name[0] === '=') {
            emitError(context, 19);
        }
        {
            const pattern = /["'<]/g;
            let m;
            while(m = /["'<]/g.exec(name)){
                emitError(context, 17, m.index);
            }
        }
        advanceBy(context, name.length);
        let value = undefined;
        if (/^[\t\r\n\f ]*=/.test(context.source)) {
            advanceSpaces(context);
            advanceBy(context, 1);
            advanceSpaces(context);
            value = parseAttributeValue(context);
            if (!value) {
                emitError(context, 13);
            }
        }
        const loc = getSelection(context, start);
        if (!context.inVPre && /^(v-|:|@|#)/.test(name)) {
            const match1 = /(?:^v-([a-z0-9-]+))?(?:(?::|^@|^#)(\[[^\]]+\]|[^\.]+))?(.+)?$/i.exec(name);
            const dirName = match1[1] || (startsWith(name, ':') ? 'bind' : startsWith(name, '@') ? 'on' : 'slot');
            let arg;
            if (match1[2]) {
                const isSlot = dirName === 'slot';
                const startOffset = name.indexOf(match1[2]);
                const loc1 = getSelection(context, getNewPosition(context, start, startOffset), getNewPosition(context, start, startOffset + match1[2].length + (isSlot && match1[3] || '').length));
                let content = match1[2];
                let isStatic = true;
                if (content.startsWith('[')) {
                    isStatic = false;
                    if (!content.endsWith(']')) {
                        emitError(context, 26);
                    }
                    content = content.substr(1, content.length - 2);
                } else if (isSlot) {
                    content += match1[3] || '';
                }
                arg = {
                    type: 4,
                    content,
                    isStatic,
                    isConstant: isStatic,
                    loc: loc1
                };
            }
            if (value && value.isQuoted) {
                const valueLoc = value.loc;
                valueLoc.start.offset++;
                valueLoc.start.column++;
                valueLoc.end = advancePositionWithClone(valueLoc.start, value.content);
                valueLoc.source = valueLoc.source.slice(1, -1);
            }
            return {
                type: 7,
                name: dirName,
                exp: value && {
                    type: 4,
                    content: value.content,
                    isStatic: false,
                    isConstant: false,
                    loc: value.loc
                },
                arg,
                modifiers: match1[3] ? match1[3].substr(1).split('.') : [],
                loc
            };
        }
        return {
            type: 6,
            name,
            value: value && {
                type: 2,
                content: value.content,
                loc: value.loc
            },
            loc
        };
    }
    function parseAttributeValue(context) {
        const start = getCursor(context);
        let content;
        const quote = context.source[0];
        const isQuoted = quote === `"` || quote === `'`;
        if (isQuoted) {
            advanceBy(context, 1);
            const endIndex = context.source.indexOf(quote);
            if (endIndex === -1) {
                content = parseTextData(context, context.source.length, 4);
            } else {
                content = parseTextData(context, endIndex, 4);
                advanceBy(context, 1);
            }
        } else {
            const match = /^[^\t\r\n\f >]+/.exec(context.source);
            if (!match) {
                return undefined;
            }
            const unexpectedChars = /["'<=`]/g;
            let m;
            while(m = /["'<=`]/g.exec(match[0])){
                emitError(context, 18, m.index);
            }
            content = parseTextData(context, match[0].length, 4);
        }
        return {
            content,
            isQuoted,
            loc: getSelection(context, start)
        };
    }
    function parseInterpolation(context, mode) {
        const [open, close] = context.options.delimiters;
        const closeIndex = context.source.indexOf(close, open.length);
        if (closeIndex === -1) {
            emitError(context, 25);
            return undefined;
        }
        const start = getCursor(context);
        advanceBy(context, open.length);
        const innerStart = getCursor(context);
        const innerEnd = getCursor(context);
        const rawContentLength = closeIndex - open.length;
        const rawContent = context.source.slice(0, rawContentLength);
        const preTrimContent = parseTextData(context, rawContentLength, mode);
        const content = preTrimContent.trim();
        const startOffset = preTrimContent.indexOf(content);
        if (startOffset > 0) {
            advancePositionWithMutation(innerStart, rawContent, startOffset);
        }
        const endOffset = rawContentLength - (preTrimContent.length - content.length - startOffset);
        advancePositionWithMutation(innerEnd, rawContent, endOffset);
        advanceBy(context, close.length);
        return {
            type: 5,
            content: {
                type: 4,
                isStatic: false,
                isConstant: false,
                content,
                loc: getSelection(context, innerStart, innerEnd)
            },
            loc: getSelection(context, start)
        };
    }
    function parseText(context, mode) {
        const endTokens = [
            '<',
            context.options.delimiters[0]
        ];
        if (mode === 3) {
            endTokens.push(']]>');
        }
        let endIndex = context.source.length;
        for(let i = 0; i < endTokens.length; i++){
            const index = context.source.indexOf(endTokens[i], 1);
            if (index !== -1 && endIndex > index) {
                endIndex = index;
            }
        }
        const start = getCursor(context);
        const content = parseTextData(context, endIndex, mode);
        return {
            type: 2,
            content,
            loc: getSelection(context, start)
        };
    }
    function parseTextData(context, length, mode) {
        const rawText = context.source.slice(0, length);
        advanceBy(context, length);
        if (mode === 2 || mode === 3 || rawText.indexOf('&') === -1) {
            return rawText;
        } else {
            return context.options.decodeEntities(rawText, mode === 4);
        }
    }
    function getCursor(context) {
        const { column , line , offset  } = context;
        return {
            column,
            line,
            offset
        };
    }
    function getSelection(context, start, end) {
        end = end || getCursor(context);
        return {
            start,
            end,
            source: context.originalSource.slice(start.offset, end.offset)
        };
    }
    function last(xs) {
        return xs[xs.length - 1];
    }
    function startsWith(source, searchString) {
        return source.startsWith(searchString);
    }
    function advanceBy(context, numberOfCharacters) {
        const { source  } = context;
        advancePositionWithMutation(context, source, numberOfCharacters);
        context.source = source.slice(numberOfCharacters);
    }
    function advanceSpaces(context) {
        const match = /^[\t\r\n\f ]+/.exec(context.source);
        if (match) {
            advanceBy(context, match[0].length);
        }
    }
    function getNewPosition(context, start, numberOfCharacters) {
        return advancePositionWithClone(start, context.originalSource.slice(start.offset, numberOfCharacters), numberOfCharacters);
    }
    function emitError(context, code, offset, loc = getCursor(context)) {
        if (offset) {
            loc.offset += offset;
            loc.column += offset;
        }
        context.options.onError(createCompilerError(code, {
            start: loc,
            end: loc,
            source: ''
        }));
    }
    function isEnd(context, mode, ancestors) {
        const s = context.source;
        switch(mode){
            case 0:
                if (startsWith(s, '</')) {
                    for(let i = ancestors.length - 1; i >= 0; --i){
                        if (startsWithEndTagOpen(s, ancestors[i].tag)) {
                            return true;
                        }
                    }
                }
                break;
            case 1:
            case 2:
                {
                    const parent = last(ancestors);
                    if (parent && startsWithEndTagOpen(s, parent.tag)) {
                        return true;
                    }
                    break;
                }
            case 3:
                if (startsWith(s, ']]>')) {
                    return true;
                }
                break;
        }
        return !s;
    }
    function startsWithEndTagOpen(source, tag) {
        return startsWith(source, '</') && source.substr(2, tag.length).toLowerCase() === tag.toLowerCase() && /[\t\r\n\f />]/.test(source[2 + tag.length] || '>');
    }
    function hoistStatic(root, context) {
        walk(root, context, new Map(), isSingleElementRoot(root, root.children[0]));
    }
    function isSingleElementRoot(root, child) {
        const { children  } = root;
        return children.length === 1 && child.type === 1 && !isSlotOutlet(child);
    }
    function walk(node, context, resultCache, doNotHoistNode = false) {
        let hasHoistedNode = false;
        let hasRuntimeConstant = false;
        const { children  } = node;
        for(let i = 0; i < children.length; i++){
            const child = children[i];
            if (child.type === 1 && child.tagType === 0) {
                let staticType;
                if (!doNotHoistNode && (staticType = getStaticType(child, resultCache)) > 0) {
                    if (staticType === 2) {
                        hasRuntimeConstant = true;
                    }
                    child.codegenNode.patchFlag = -1 + ` /* HOISTED */`;
                    child.codegenNode = context.hoist(child.codegenNode);
                    hasHoistedNode = true;
                    continue;
                } else {
                    const codegenNode = child.codegenNode;
                    if (codegenNode.type === 13) {
                        const flag = getPatchFlag(codegenNode);
                        if ((!flag || flag === 512 || flag === 1) && !hasNonHoistableProps(child)) {
                            const props = getNodeProps(child);
                            if (props) {
                                codegenNode.props = context.hoist(props);
                            }
                        }
                    }
                }
            } else if (child.type === 12) {
                const staticType = getStaticType(child.content, resultCache);
                if (staticType > 0) {
                    if (staticType === 2) {
                        hasRuntimeConstant = true;
                    }
                    child.codegenNode = context.hoist(child.codegenNode);
                    hasHoistedNode = true;
                }
            }
            if (child.type === 1) {
                walk(child, context, resultCache);
            } else if (child.type === 11) {
                walk(child, context, resultCache, child.children.length === 1);
            } else if (child.type === 9) {
                for(let i1 = 0; i1 < child.branches.length; i1++){
                    walk(child.branches[i1], context, resultCache, child.branches[i1].children.length === 1);
                }
            }
        }
        if (!hasRuntimeConstant && hasHoistedNode && context.transformHoist) {
            context.transformHoist(children, context, node);
        }
    }
    function getStaticType(node, resultCache = new Map()) {
        switch(node.type){
            case 1:
                if (node.tagType !== 0) {
                    return 0;
                }
                const cached = resultCache.get(node);
                if (cached !== undefined) {
                    return cached;
                }
                const codegenNode = node.codegenNode;
                if (codegenNode.type !== 13) {
                    return 0;
                }
                const flag = getPatchFlag(codegenNode);
                if (!flag && !hasNonHoistableProps(node)) {
                    let returnType = 1;
                    for(let i = 0; i < node.children.length; i++){
                        const childType = getStaticType(node.children[i], resultCache);
                        if (childType === 0) {
                            resultCache.set(node, 0);
                            return 0;
                        } else if (childType === 2) {
                            returnType = 2;
                        }
                    }
                    if (returnType !== 2) {
                        for(let i1 = 0; i1 < node.props.length; i1++){
                            const p1 = node.props[i1];
                            if (p1.type === 7 && p1.name === 'bind' && p1.exp && (p1.exp.type === 8 || p1.exp.isRuntimeConstant)) {
                                returnType = 2;
                            }
                        }
                    }
                    if (codegenNode.isBlock) {
                        codegenNode.isBlock = false;
                    }
                    resultCache.set(node, returnType);
                    return returnType;
                } else {
                    resultCache.set(node, 0);
                    return 0;
                }
            case 2:
            case 3:
                return 1;
            case 9:
            case 11:
            case 10:
                return 0;
            case 5:
            case 12:
                return getStaticType(node.content, resultCache);
            case 4:
                return node.isConstant ? node.isRuntimeConstant ? 2 : 1 : 0;
            case 8:
                let returnType = 1;
                for(let i = 0; i < node.children.length; i++){
                    const child = node.children[i];
                    if (isString(child) || isSymbol(child)) {
                        continue;
                    }
                    const childType = getStaticType(child, resultCache);
                    if (childType === 0) {
                        return 0;
                    } else if (childType === 2) {
                        returnType = 2;
                    }
                }
                return returnType;
            default:
                return 0;
        }
    }
    function hasNonHoistableProps(node) {
        const props = getNodeProps(node);
        if (props && props.type === 15) {
            const { properties  } = props;
            for(let i = 0; i < properties.length; i++){
                const { key , value  } = properties[i];
                if (key.type !== 4 || !key.isStatic || (value.type !== 4 || !value.isStatic && !value.isConstant)) {
                    return true;
                }
            }
        }
        return false;
    }
    function getNodeProps(node) {
        const codegenNode = node.codegenNode;
        if (codegenNode.type === 13) {
            return codegenNode.props;
        }
    }
    function getPatchFlag(node) {
        const flag = node.patchFlag;
        return flag ? parseInt(flag, 10) : undefined;
    }
    function createTransformContext(root, { prefixIdentifiers =false , hoistStatic: hoistStatic1 = false , cacheHandlers =false , nodeTransforms =[] , directiveTransforms ={
    } , transformHoist =null , isBuiltInComponent =NOOP , isCustomElement =NOOP , expressionPlugins =[] , scopeId =null , ssr =false , ssrCssVars =`` , bindingMetadata ={
    } , onError =defaultOnError  }) {
        const context = {
            prefixIdentifiers,
            hoistStatic: hoistStatic1,
            cacheHandlers,
            nodeTransforms,
            directiveTransforms,
            transformHoist,
            isBuiltInComponent,
            isCustomElement,
            expressionPlugins,
            scopeId,
            ssr,
            ssrCssVars,
            bindingMetadata,
            onError,
            root,
            helpers: new Set(),
            components: new Set(),
            directives: new Set(),
            hoists: [],
            imports: new Set(),
            temps: 0,
            cached: 0,
            identifiers: Object.create(null),
            scopes: {
                vFor: 0,
                vSlot: 0,
                vPre: 0,
                vOnce: 0
            },
            parent: null,
            currentNode: root,
            childIndex: 0,
            helper (name) {
                context.helpers.add(name);
                return name;
            },
            helperString (name) {
                return `_${helperNameMap[context.helper(name)]}`;
            },
            replaceNode (node) {
                {
                    if (!context.currentNode) {
                        throw new Error(`Node being replaced is already removed.`);
                    }
                    if (!context.parent) {
                        throw new Error(`Cannot replace root node.`);
                    }
                }
                context.parent.children[context.childIndex] = context.currentNode = node;
            },
            removeNode (node) {
                if (!context.parent) {
                    throw new Error(`Cannot remove root node.`);
                }
                const list = context.parent.children;
                const removalIndex = node ? list.indexOf(node) : context.currentNode ? context.childIndex : -1;
                if (removalIndex < 0) {
                    throw new Error(`node being removed is not a child of current parent`);
                }
                if (!node || node === context.currentNode) {
                    context.currentNode = null;
                    context.onNodeRemoved();
                } else {
                    if (context.childIndex > removalIndex) {
                        context.childIndex--;
                        context.onNodeRemoved();
                    }
                }
                context.parent.children.splice(removalIndex, 1);
            },
            onNodeRemoved: ()=>{
            },
            addIdentifiers (exp) {
            },
            removeIdentifiers (exp) {
            },
            hoist (exp) {
                context.hoists.push(exp);
                const identifier = createSimpleExpression(`_hoisted_${context.hoists.length}`, false, exp.loc, true);
                identifier.hoisted = exp;
                return identifier;
            },
            cache (exp, isVNode = false) {
                return createCacheExpression(++context.cached, exp, isVNode);
            }
        };
        return context;
    }
    function transform(root, options) {
        const context = createTransformContext(root, options);
        traverseNode(root, context);
        if (options.hoistStatic) {
            hoistStatic(root, context);
        }
        if (!options.ssr) {
            createRootCodegen(root, context);
        }
        root.helpers = [
            ...context.helpers
        ];
        root.components = [
            ...context.components
        ];
        root.directives = [
            ...context.directives
        ];
        root.imports = [
            ...context.imports
        ];
        root.hoists = context.hoists;
        root.temps = context.temps;
        root.cached = context.cached;
    }
    function createRootCodegen(root, context) {
        const { helper  } = context;
        const { children  } = root;
        if (children.length === 1) {
            const child = children[0];
            if (isSingleElementRoot(root, child) && child.codegenNode) {
                const codegenNode = child.codegenNode;
                if (codegenNode.type === 13) {
                    codegenNode.isBlock = true;
                    helper(OPEN_BLOCK);
                    helper(CREATE_BLOCK);
                }
                root.codegenNode = codegenNode;
            } else {
                root.codegenNode = child;
            }
        } else if (children.length > 1) {
            root.codegenNode = createVNodeCall(context, helper(FRAGMENT), undefined, root.children, `${64} /* ${PatchFlagNames[64]} */`, undefined, undefined, true);
        } else ;
    }
    function traverseChildren(parent, context) {
        let i = 0;
        const nodeRemoved = ()=>{
            i--;
        };
        for(; i < parent.children.length; i++){
            const child = parent.children[i];
            if (isString(child)) continue;
            context.parent = parent;
            context.childIndex = i;
            context.onNodeRemoved = nodeRemoved;
            traverseNode(child, context);
        }
    }
    function traverseNode(node, context) {
        context.currentNode = node;
        const { nodeTransforms  } = context;
        const exitFns = [];
        for(let i = 0; i < nodeTransforms.length; i++){
            const onExit = nodeTransforms[i](node, context);
            if (onExit) {
                if (isArray(onExit)) {
                    exitFns.push(...onExit);
                } else {
                    exitFns.push(onExit);
                }
            }
            if (!context.currentNode) {
                return;
            } else {
                node = context.currentNode;
            }
        }
        switch(node.type){
            case 3:
                if (!context.ssr) {
                    context.helper(CREATE_COMMENT);
                }
                break;
            case 5:
                if (!context.ssr) {
                    context.helper(TO_DISPLAY_STRING);
                }
                break;
            case 9:
                for(let i1 = 0; i1 < node.branches.length; i1++){
                    traverseNode(node.branches[i1], context);
                }
                break;
            case 10:
            case 11:
            case 1:
            case 0:
                traverseChildren(node, context);
                break;
        }
        context.currentNode = node;
        let i2 = exitFns.length;
        while(i2--){
            exitFns[i2]();
        }
    }
    function createStructuralDirectiveTransform(name, fn) {
        const matches1 = isString(name) ? (n)=>n === name
         : (n)=>name.test(n)
        ;
        return (node, context)=>{
            if (node.type === 1) {
                const { props  } = node;
                if (node.tagType === 3 && props.some(isVSlot)) {
                    return;
                }
                const exitFns = [];
                for(let i = 0; i < props.length; i++){
                    const prop = props[i];
                    if (prop.type === 7 && matches1(prop.name)) {
                        props.splice(i, 1);
                        i--;
                        const onExit = fn(node, prop, context);
                        if (onExit) exitFns.push(onExit);
                    }
                }
                return exitFns;
            }
        };
    }
    const PURE_ANNOTATION = `/*#__PURE__*/`;
    function createCodegenContext(ast, { mode ='function' , prefixIdentifiers =mode === 'module' , sourceMap =false , filename =`template.vue.html` , scopeId =null , optimizeImports =false , runtimeGlobalName =`Vue` , runtimeModuleName =`vue` , ssr =false  }) {
        const context = {
            mode,
            prefixIdentifiers,
            sourceMap,
            filename,
            scopeId,
            optimizeImports,
            runtimeGlobalName,
            runtimeModuleName,
            ssr,
            source: ast.loc.source,
            code: ``,
            column: 1,
            line: 1,
            offset: 0,
            indentLevel: 0,
            pure: false,
            map: undefined,
            helper (key) {
                return `_${helperNameMap[key]}`;
            },
            push (code, node) {
                context.code += code;
            },
            indent () {
                newline(++context.indentLevel);
            },
            deindent (withoutNewLine = false) {
                if (withoutNewLine) {
                    --context.indentLevel;
                } else {
                    newline(--context.indentLevel);
                }
            },
            newline () {
                newline(context.indentLevel);
            }
        };
        function newline(n) {
            context.push('\n' + `  `.repeat(n));
        }
        return context;
    }
    function generate(ast, options = {
    }) {
        const context = createCodegenContext(ast, options);
        if (options.onContextCreated) options.onContextCreated(context);
        const { mode , push , prefixIdentifiers , indent , deindent , newline , scopeId , ssr  } = context;
        const hasHelpers = ast.helpers.length > 0;
        const useWithBlock = !prefixIdentifiers && mode !== 'module';
        {
            genFunctionPreamble(ast, context);
        }
        const optimizeSources = options.bindingMetadata ? `, $props, $setup, $data, $options` : ``;
        if (!ssr) {
            push(`function render(_ctx, _cache${optimizeSources}) {`);
        } else {
            push(`function ssrRender(_ctx, _push, _parent, _attrs${optimizeSources}) {`);
        }
        indent();
        if (useWithBlock) {
            push(`with (_ctx) {`);
            indent();
            if (hasHelpers) {
                push(`const { ${ast.helpers.map((s)=>`${helperNameMap[s]}: _${helperNameMap[s]}`
                ).join(', ')} } = _Vue`);
                push(`\n`);
                newline();
            }
        }
        if (ast.components.length) {
            genAssets(ast.components, 'component', context);
            if (ast.directives.length || ast.temps > 0) {
                newline();
            }
        }
        if (ast.directives.length) {
            genAssets(ast.directives, 'directive', context);
            if (ast.temps > 0) {
                newline();
            }
        }
        if (ast.temps > 0) {
            push(`let `);
            for(let i = 0; i < ast.temps; i++){
                push(`${i > 0 ? `, ` : ``}_temp${i}`);
            }
        }
        if (ast.components.length || ast.directives.length || ast.temps) {
            push(`\n`);
            newline();
        }
        if (!ssr) {
            push(`return `);
        }
        if (ast.codegenNode) {
            genNode(ast.codegenNode, context);
        } else {
            push(`null`);
        }
        if (useWithBlock) {
            deindent();
            push(`}`);
        }
        deindent();
        push(`}`);
        return {
            ast,
            code: context.code,
            map: context.map ? context.map.toJSON() : undefined
        };
    }
    function genFunctionPreamble(ast, context) {
        const { ssr , prefixIdentifiers , push , newline , runtimeModuleName , runtimeGlobalName  } = context;
        const VueBinding = runtimeGlobalName;
        const aliasHelper = (s)=>`${helperNameMap[s]}: _${helperNameMap[s]}`
        ;
        if (ast.helpers.length > 0) {
            {
                push(`const _Vue = ${runtimeGlobalName}\n`);
                if (ast.hoists.length) {
                    const staticHelpers = [
                        CREATE_VNODE,
                        CREATE_COMMENT,
                        CREATE_TEXT,
                        CREATE_STATIC
                    ].filter((helper)=>ast.helpers.includes(helper)
                    ).map(aliasHelper).join(', ');
                    push(`const { ${staticHelpers} } = _Vue\n`);
                }
            }
        }
        genHoists(ast.hoists, context);
        newline();
        push(`return `);
    }
    function genAssets(assets, type, { helper , push , newline  }) {
        const resolver = helper(type === 'component' ? RESOLVE_COMPONENT : RESOLVE_DIRECTIVE);
        for(let i = 0; i < assets.length; i++){
            const id = assets[i];
            push(`const ${toValidAssetId(id, type)} = ${resolver}(${JSON.stringify(id)})`);
            if (i < assets.length - 1) {
                newline();
            }
        }
    }
    function genHoists(hoists, context) {
        if (!hoists.length) {
            return;
        }
        context.pure = true;
        const { push , newline , helper , scopeId , mode  } = context;
        newline();
        hoists.forEach((exp, i)=>{
            if (exp) {
                push(`const _hoisted_${i + 1} = `);
                genNode(exp, context);
                newline();
            }
        });
        context.pure = false;
    }
    function isText$1(n) {
        return isString(n) || n.type === 4 || n.type === 2 || n.type === 5 || n.type === 8;
    }
    function genNodeListAsArray(nodes, context) {
        const multilines = nodes.length > 3 || nodes.some((n)=>isArray(n) || !isText$1(n)
        );
        context.push(`[`);
        multilines && context.indent();
        genNodeList(nodes, context, multilines);
        multilines && context.deindent();
        context.push(`]`);
    }
    function genNodeList(nodes, context, multilines = false, comma = true) {
        const { push , newline  } = context;
        for(let i = 0; i < nodes.length; i++){
            const node = nodes[i];
            if (isString(node)) {
                push(node);
            } else if (isArray(node)) {
                genNodeListAsArray(node, context);
            } else {
                genNode(node, context);
            }
            if (i < nodes.length - 1) {
                if (multilines) {
                    comma && push(',');
                    newline();
                } else {
                    comma && push(', ');
                }
            }
        }
    }
    function genNode(node, context) {
        if (isString(node)) {
            context.push(node);
            return;
        }
        if (isSymbol(node)) {
            context.push(context.helper(node));
            return;
        }
        switch(node.type){
            case 1:
            case 9:
            case 11:
                assert(node.codegenNode != null, `Codegen node is missing for element/if/for node. ` + `Apply appropriate transforms first.`);
                genNode(node.codegenNode, context);
                break;
            case 2:
                genText(node, context);
                break;
            case 4:
                genExpression(node, context);
                break;
            case 5:
                genInterpolation(node, context);
                break;
            case 12:
                genNode(node.codegenNode, context);
                break;
            case 8:
                genCompoundExpression(node, context);
                break;
            case 3:
                genComment(node, context);
                break;
            case 13:
                genVNodeCall(node, context);
                break;
            case 14:
                genCallExpression(node, context);
                break;
            case 15:
                genObjectExpression(node, context);
                break;
            case 17:
                genArrayExpression(node, context);
                break;
            case 18:
                genFunctionExpression(node, context);
                break;
            case 19:
                genConditionalExpression(node, context);
                break;
            case 20:
                genCacheExpression(node, context);
                break;
            case 21: break;
            case 22: break;
            case 23: break;
            case 24: break;
            case 25: break;
            case 26: break;
            case 10: break;
            default:
                {
                    assert(false, `unhandled codegen node type: ${node.type}`);
                    const exhaustiveCheck = node;
                    return node;
                }
        }
    }
    function genText(node, context) {
        context.push(JSON.stringify(node.content), node);
    }
    function genExpression(node, context) {
        const { content , isStatic  } = node;
        context.push(isStatic ? JSON.stringify(content) : content, node);
    }
    function genInterpolation(node, context) {
        const { push , helper , pure  } = context;
        if (pure) push(PURE_ANNOTATION);
        push(`${helper(TO_DISPLAY_STRING)}(`);
        genNode(node.content, context);
        push(`)`);
    }
    function genCompoundExpression(node, context) {
        for(let i = 0; i < node.children.length; i++){
            const child = node.children[i];
            if (isString(child)) {
                context.push(child);
            } else {
                genNode(child, context);
            }
        }
    }
    function genExpressionAsPropertyKey(node, context) {
        const { push  } = context;
        if (node.type === 8) {
            push(`[`);
            genCompoundExpression(node, context);
            push(`]`);
        } else if (node.isStatic) {
            const text = isSimpleIdentifier(node.content) ? node.content : JSON.stringify(node.content);
            push(text, node);
        } else {
            push(`[${node.content}]`, node);
        }
    }
    function genComment(node, context) {
        {
            const { push , helper , pure  } = context;
            if (pure) {
                push(PURE_ANNOTATION);
            }
            push(`${helper(CREATE_COMMENT)}(${JSON.stringify(node.content)})`, node);
        }
    }
    function genVNodeCall(node, context) {
        const { push , helper , pure  } = context;
        const { tag , props , children , patchFlag , dynamicProps , directives , isBlock , disableTracking  } = node;
        if (directives) {
            push(helper(WITH_DIRECTIVES) + `(`);
        }
        if (isBlock) {
            push(`(${helper(OPEN_BLOCK)}(${disableTracking ? `true` : ``}), `);
        }
        if (pure) {
            push(PURE_ANNOTATION);
        }
        push(helper(isBlock ? CREATE_BLOCK : CREATE_VNODE) + `(`, node);
        genNodeList(genNullableArgs([
            tag,
            props,
            children,
            patchFlag,
            dynamicProps
        ]), context);
        push(`)`);
        if (isBlock) {
            push(`)`);
        }
        if (directives) {
            push(`, `);
            genNode(directives, context);
            push(`)`);
        }
    }
    function genNullableArgs(args) {
        let i = args.length;
        while(i--){
            if (args[i] != null) break;
        }
        return args.slice(0, i + 1).map((arg)=>arg || `null`
        );
    }
    function genCallExpression(node, context) {
        const { push , helper , pure  } = context;
        const callee = isString(node.callee) ? node.callee : helper(node.callee);
        if (pure) {
            push(PURE_ANNOTATION);
        }
        push(callee + `(`, node);
        genNodeList(node.arguments, context);
        push(`)`);
    }
    function genObjectExpression(node, context) {
        const { push , indent , deindent , newline  } = context;
        const { properties  } = node;
        if (!properties.length) {
            push(`{}`, node);
            return;
        }
        const multilines = properties.length > 1 || properties.some((p1)=>p1.value.type !== 4
        );
        push(multilines ? `{` : `{ `);
        multilines && indent();
        for(let i = 0; i < properties.length; i++){
            const { key , value  } = properties[i];
            genExpressionAsPropertyKey(key, context);
            push(`: `);
            genNode(value, context);
            if (i < properties.length - 1) {
                push(`,`);
                newline();
            }
        }
        multilines && deindent();
        push(multilines ? `}` : ` }`);
    }
    function genArrayExpression(node, context) {
        genNodeListAsArray(node.elements, context);
    }
    function genFunctionExpression(node, context) {
        const { push , indent , deindent , scopeId , mode  } = context;
        const { params , returns , body , newline , isSlot  } = node;
        if (isSlot) {
            push(`_${helperNameMap[WITH_CTX]}(`);
        }
        push(`(`, node);
        if (isArray(params)) {
            genNodeList(params, context);
        } else if (params) {
            genNode(params, context);
        }
        push(`) => `);
        if (newline || body) {
            push(`{`);
            indent();
        }
        if (returns) {
            if (newline) {
                push(`return `);
            }
            if (isArray(returns)) {
                genNodeListAsArray(returns, context);
            } else {
                genNode(returns, context);
            }
        } else if (body) {
            genNode(body, context);
        }
        if (newline || body) {
            deindent();
            push(`}`);
        }
        if (isSlot) {
            push(`)`);
        }
    }
    function genConditionalExpression(node, context) {
        const { test , consequent , alternate , newline: needNewline  } = node;
        const { push , indent , deindent , newline  } = context;
        if (test.type === 4) {
            const needsParens = !isSimpleIdentifier(test.content);
            needsParens && push(`(`);
            genExpression(test, context);
            needsParens && push(`)`);
        } else {
            push(`(`);
            genNode(test, context);
            push(`)`);
        }
        needNewline && indent();
        context.indentLevel++;
        needNewline || push(` `);
        push(`? `);
        genNode(consequent, context);
        context.indentLevel--;
        needNewline && newline();
        needNewline || push(` `);
        push(`: `);
        const isNested = alternate.type === 19;
        if (!isNested) {
            context.indentLevel++;
        }
        genNode(alternate, context);
        if (!isNested) {
            context.indentLevel--;
        }
        needNewline && deindent(true);
    }
    function genCacheExpression(node, context) {
        const { push , helper , indent , deindent , newline  } = context;
        push(`_cache[${node.index}] || (`);
        if (node.isVNode) {
            indent();
            push(`${helper(SET_BLOCK_TRACKING)}(-1),`);
            newline();
        }
        push(`_cache[${node.index}] = `);
        genNode(node.value, context);
        if (node.isVNode) {
            push(`,`);
            newline();
            push(`${helper(SET_BLOCK_TRACKING)}(1),`);
            newline();
            push(`_cache[${node.index}]`);
            deindent();
        }
        push(`)`);
    }
    const prohibitedKeywordRE = new RegExp('\\b' + ('do,if,for,let,new,try,var,case,else,with,await,break,catch,class,const,' + 'super,throw,while,yield,delete,export,import,return,switch,default,' + 'extends,finally,continue,debugger,function,arguments,typeof,void').split(',').join('\\b|\\b') + '\\b');
    const stripStringRE = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*\$\{|\}(?:[^`\\]|\\.)*`|`(?:[^`\\]|\\.)*`/g;
    function validateBrowserExpression(node, context, asParams = false, asRawStatements = false) {
        const exp = node.content;
        if (!exp.trim()) {
            return;
        }
        try {
            new Function(asRawStatements ? ` ${exp} ` : `return ${asParams ? `(${exp}) => {}` : `(${exp})`}`);
        } catch (e) {
            let message = e.message;
            const keywordMatch = exp.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*\$\{|\}(?:[^`\\]|\\.)*`|`(?:[^`\\]|\\.)*`/g, '').match(prohibitedKeywordRE);
            if (keywordMatch) {
                message = `avoid using JavaScript keyword as property name: "${keywordMatch[0]}"`;
            }
            context.onError(createCompilerError(43, node.loc, undefined, message));
        }
    }
    const transformExpression = (node, context)=>{
        if (node.type === 5) {
            node.content = processExpression(node.content, context);
        } else if (node.type === 1) {
            for(let i = 0; i < node.props.length; i++){
                const dir = node.props[i];
                if (dir.type === 7 && dir.name !== 'for') {
                    const exp = dir.exp;
                    const arg = dir.arg;
                    if (exp && exp.type === 4 && !(dir.name === 'on' && arg)) {
                        dir.exp = processExpression(exp, context, dir.name === 'slot');
                    }
                    if (arg && arg.type === 4 && !arg.isStatic) {
                        dir.arg = processExpression(arg, context);
                    }
                }
            }
        }
    };
    function processExpression(node, context, asParams = false, asRawStatements = false) {
        {
            validateBrowserExpression(node, context, asParams, asRawStatements);
            return node;
        }
    }
    const transformIf = createStructuralDirectiveTransform(/^(if|else|else-if)$/, (node, dir, context)=>{
        return processIf(node, dir, context, (ifNode, branch, isRoot)=>{
            const siblings = context.parent.children;
            let i = siblings.indexOf(ifNode);
            let key = 0;
            while((i--) >= 0){
                const sibling = siblings[i];
                if (sibling && sibling.type === 9) {
                    key += sibling.branches.length;
                }
            }
            return ()=>{
                if (isRoot) {
                    ifNode.codegenNode = createCodegenNodeForBranch(branch, key, context);
                } else {
                    const parentCondition = getParentCondition(ifNode.codegenNode);
                    parentCondition.alternate = createCodegenNodeForBranch(branch, key + ifNode.branches.length - 1, context);
                }
            };
        });
    });
    function processIf(node, dir, context, processCodegen) {
        if (dir.name !== 'else' && (!dir.exp || !dir.exp.content.trim())) {
            const loc = dir.exp ? dir.exp.loc : node.loc;
            context.onError(createCompilerError(27, dir.loc));
            dir.exp = createSimpleExpression(`true`, false, loc);
        }
        if (dir.exp) {
            validateBrowserExpression(dir.exp, context);
        }
        if (dir.name === 'if') {
            const branch = createIfBranch(node, dir);
            const ifNode = {
                type: 9,
                loc: node.loc,
                branches: [
                    branch
                ]
            };
            context.replaceNode(ifNode);
            if (processCodegen) {
                return processCodegen(ifNode, branch, true);
            }
        } else {
            const siblings = context.parent.children;
            const comments = [];
            let i = siblings.indexOf(node);
            while((i--) >= -1){
                const sibling = siblings[i];
                if (sibling && sibling.type === 3) {
                    context.removeNode(sibling);
                    comments.unshift(sibling);
                    continue;
                }
                if (sibling && sibling.type === 2 && !sibling.content.trim().length) {
                    context.removeNode(sibling);
                    continue;
                }
                if (sibling && sibling.type === 9) {
                    context.removeNode();
                    const branch = createIfBranch(node, dir);
                    if (comments.length) {
                        branch.children = [
                            ...comments,
                            ...branch.children
                        ];
                    }
                    {
                        const key = branch.userKey;
                        if (key) {
                            sibling.branches.forEach(({ userKey  })=>{
                                if (isSameKey(userKey, key)) {
                                    context.onError(createCompilerError(28, branch.userKey.loc));
                                }
                            });
                        }
                    }
                    sibling.branches.push(branch);
                    const onExit = processCodegen && processCodegen(sibling, branch, false);
                    traverseNode(branch, context);
                    if (onExit) onExit();
                    context.currentNode = null;
                } else {
                    context.onError(createCompilerError(29, node.loc));
                }
                break;
            }
        }
    }
    function createIfBranch(node, dir) {
        return {
            type: 10,
            loc: node.loc,
            condition: dir.name === 'else' ? undefined : dir.exp,
            children: node.tagType === 3 && !findDir(node, 'for') ? node.children : [
                node
            ],
            userKey: findProp(node, `key`)
        };
    }
    function createCodegenNodeForBranch(branch, keyIndex, context) {
        if (branch.condition) {
            return createConditionalExpression(branch.condition, createChildrenCodegenNode(branch, keyIndex, context), createCallExpression(context.helper(CREATE_COMMENT), [
                '\"v-if\"',
                'true'
            ]));
        } else {
            return createChildrenCodegenNode(branch, keyIndex, context);
        }
    }
    function createChildrenCodegenNode(branch, keyIndex, context) {
        const { helper  } = context;
        const keyProperty = createObjectProperty(`key`, createSimpleExpression(`${keyIndex}`, false, locStub, true));
        const { children  } = branch;
        const firstChild = children[0];
        const needFragmentWrapper = children.length !== 1 || firstChild.type !== 1;
        if (needFragmentWrapper) {
            if (children.length === 1 && firstChild.type === 11) {
                const vnodeCall = firstChild.codegenNode;
                injectProp(vnodeCall, keyProperty, context);
                return vnodeCall;
            } else {
                return createVNodeCall(context, helper(FRAGMENT), createObjectExpression([
                    keyProperty
                ]), children, `${64} /* ${PatchFlagNames[64]} */`, undefined, undefined, true, false, branch.loc);
            }
        } else {
            const vnodeCall = firstChild.codegenNode;
            if (vnodeCall.type === 13) {
                vnodeCall.isBlock = true;
                helper(OPEN_BLOCK);
                helper(CREATE_BLOCK);
            }
            injectProp(vnodeCall, keyProperty, context);
            return vnodeCall;
        }
    }
    function isSameKey(a, b) {
        if (!a || a.type !== b.type) {
            return false;
        }
        if (a.type === 6) {
            if (a.value.content !== b.value.content) {
                return false;
            }
        } else {
            const exp = a.exp;
            const branchExp = b.exp;
            if (exp.type !== branchExp.type) {
                return false;
            }
            if (exp.type !== 4 || (exp.isStatic !== branchExp.isStatic || exp.content !== branchExp.content)) {
                return false;
            }
        }
        return true;
    }
    function getParentCondition(node) {
        while(true){
            if (node.type === 19) {
                if (node.alternate.type === 19) {
                    node = node.alternate;
                } else {
                    return node;
                }
            } else if (node.type === 20) {
                node = node.value;
            }
        }
    }
    const transformFor = createStructuralDirectiveTransform('for', (node, dir, context)=>{
        const { helper  } = context;
        return processFor(node, dir, context, (forNode)=>{
            const renderExp = createCallExpression(helper(RENDER_LIST), [
                forNode.source
            ]);
            const keyProp = findProp(node, `key`);
            const keyProperty = keyProp ? createObjectProperty(`key`, keyProp.type === 6 ? createSimpleExpression(keyProp.value.content, true) : keyProp.exp) : null;
            const isStableFragment = forNode.source.type === 4 && forNode.source.isConstant;
            const fragmentFlag = isStableFragment ? 64 : keyProp ? 128 : 256;
            forNode.codegenNode = createVNodeCall(context, helper(FRAGMENT), undefined, renderExp, `${fragmentFlag} /* ${PatchFlagNames[fragmentFlag]} */`, undefined, undefined, true, !isStableFragment, node.loc);
            return ()=>{
                let childBlock;
                const isTemplate = isTemplateNode(node);
                const { children  } = forNode;
                if (isTemplate) {
                    node.children.some((c)=>{
                        if (c.type === 1) {
                            const key = findProp(c, 'key');
                            if (key) {
                                context.onError(createCompilerError(32, key.loc));
                                return true;
                            }
                        }
                    });
                }
                const needFragmentWrapper = children.length !== 1 || children[0].type !== 1;
                const slotOutlet = isSlotOutlet(node) ? node : isTemplate && node.children.length === 1 && isSlotOutlet(node.children[0]) ? node.children[0] : null;
                if (slotOutlet) {
                    childBlock = slotOutlet.codegenNode;
                    if (isTemplate && keyProperty) {
                        injectProp(childBlock, keyProperty, context);
                    }
                } else if (needFragmentWrapper) {
                    childBlock = createVNodeCall(context, helper(FRAGMENT), keyProperty ? createObjectExpression([
                        keyProperty
                    ]) : undefined, node.children, `${64} /* ${PatchFlagNames[64]} */`, undefined, undefined, true);
                } else {
                    childBlock = children[0].codegenNode;
                    if (isTemplate && keyProperty) {
                        injectProp(childBlock, keyProperty, context);
                    }
                    childBlock.isBlock = !isStableFragment;
                    if (childBlock.isBlock) {
                        helper(OPEN_BLOCK);
                        helper(CREATE_BLOCK);
                    }
                }
                renderExp.arguments.push(createFunctionExpression(createForLoopParams(forNode.parseResult), childBlock, true));
            };
        });
    });
    function processFor(node, dir, context, processCodegen) {
        if (!dir.exp) {
            context.onError(createCompilerError(30, dir.loc));
            return;
        }
        const parseResult = parseForExpression(dir.exp, context);
        if (!parseResult) {
            context.onError(createCompilerError(31, dir.loc));
            return;
        }
        const { addIdentifiers , removeIdentifiers , scopes  } = context;
        const { source , value , key , index  } = parseResult;
        const forNode = {
            type: 11,
            loc: dir.loc,
            source,
            valueAlias: value,
            keyAlias: key,
            objectIndexAlias: index,
            parseResult,
            children: isTemplateNode(node) ? node.children : [
                node
            ]
        };
        context.replaceNode(forNode);
        scopes.vFor++;
        const onExit = processCodegen && processCodegen(forNode);
        return ()=>{
            scopes.vFor--;
            if (onExit) onExit();
        };
    }
    const forAliasRE = /([\s\S]*?)\s+(?:in|of)\s+([\s\S]*)/;
    const forIteratorRE = /,([^,\}\]]*)(?:,([^,\}\]]*))?$/;
    const stripParensRE = /^\(|\)$/g;
    function parseForExpression(input, context) {
        const loc = input.loc;
        const exp = input.content;
        const inMatch = exp.match(/([\s\S]*?)\s+(?:in|of)\s+([\s\S]*)/);
        if (!inMatch) return;
        const [, LHS, RHS] = inMatch;
        const result = {
            source: createAliasExpression(loc, RHS.trim(), exp.indexOf(RHS, LHS.length)),
            value: undefined,
            key: undefined,
            index: undefined
        };
        {
            validateBrowserExpression(result.source, context);
        }
        let valueContent = LHS.trim().replace(/^\(|\)$/g, '').trim();
        const trimmedOffset = LHS.indexOf(valueContent);
        const iteratorMatch = valueContent.match(/,([^,\}\]]*)(?:,([^,\}\]]*))?$/);
        if (iteratorMatch) {
            valueContent = valueContent.replace(/,([^,\}\]]*)(?:,([^,\}\]]*))?$/, '').trim();
            const keyContent = iteratorMatch[1].trim();
            let keyOffset;
            if (keyContent) {
                keyOffset = exp.indexOf(keyContent, trimmedOffset + valueContent.length);
                result.key = createAliasExpression(loc, keyContent, keyOffset);
                {
                    validateBrowserExpression(result.key, context, true);
                }
            }
            if (iteratorMatch[2]) {
                const indexContent = iteratorMatch[2].trim();
                if (indexContent) {
                    result.index = createAliasExpression(loc, indexContent, exp.indexOf(indexContent, result.key ? keyOffset + keyContent.length : trimmedOffset + valueContent.length));
                    {
                        validateBrowserExpression(result.index, context, true);
                    }
                }
            }
        }
        if (valueContent) {
            result.value = createAliasExpression(loc, valueContent, trimmedOffset);
            {
                validateBrowserExpression(result.value, context, true);
            }
        }
        return result;
    }
    function createAliasExpression(range1, content, offset) {
        return createSimpleExpression(content, false, getInnerRange(range1, offset, content.length));
    }
    function createForLoopParams({ value , key , index  }) {
        const params = [];
        if (value) {
            params.push(value);
        }
        if (key) {
            if (!value) {
                params.push(createSimpleExpression(`_`, false));
            }
            params.push(key);
        }
        if (index) {
            if (!key) {
                if (!value) {
                    params.push(createSimpleExpression(`_`, false));
                }
                params.push(createSimpleExpression(`__`, false));
            }
            params.push(index);
        }
        return params;
    }
    const defaultFallback = createSimpleExpression(`undefined`, false);
    const trackSlotScopes = (node, context)=>{
        if (node.type === 1 && (node.tagType === 1 || node.tagType === 3)) {
            const vSlot = findDir(node, 'slot');
            if (vSlot) {
                const slotProps = vSlot.exp;
                context.scopes.vSlot++;
                return ()=>{
                    context.scopes.vSlot--;
                };
            }
        }
    };
    const buildClientSlotFn = (props, children, loc)=>createFunctionExpression(props, children, false, true, children.length ? children[0].loc : loc)
    ;
    function buildSlots(node, context, buildSlotFn = buildClientSlotFn) {
        context.helper(WITH_CTX);
        const { children , loc  } = node;
        const slotsProperties = [];
        const dynamicSlots = [];
        const buildDefaultSlotProperty = (props, children1)=>createObjectProperty(`default`, buildSlotFn(props, children1, loc))
        ;
        let hasDynamicSlots = context.scopes.vSlot > 0 || context.scopes.vFor > 0;
        const onComponentSlot = findDir(node, 'slot', true);
        if (onComponentSlot) {
            const { arg , exp  } = onComponentSlot;
            if (arg && !isStaticExp(arg)) {
                hasDynamicSlots = true;
            }
            slotsProperties.push(createObjectProperty(arg || createSimpleExpression('default', true), buildSlotFn(exp, children, loc)));
        }
        let hasTemplateSlots = false;
        let hasNamedDefaultSlot = false;
        const implicitDefaultChildren = [];
        const seenSlotNames = new Set();
        for(let i = 0; i < children.length; i++){
            const slotElement = children[i];
            let slotDir;
            if (!isTemplateNode(slotElement) || !(slotDir = findDir(slotElement, 'slot', true))) {
                if (slotElement.type !== 3) {
                    implicitDefaultChildren.push(slotElement);
                }
                continue;
            }
            if (onComponentSlot) {
                context.onError(createCompilerError(36, slotDir.loc));
                break;
            }
            hasTemplateSlots = true;
            const { children: slotChildren , loc: slotLoc  } = slotElement;
            const { arg: slotName = createSimpleExpression(`default`, true) , exp: slotProps , loc: dirLoc  } = slotDir;
            let staticSlotName;
            if (isStaticExp(slotName)) {
                staticSlotName = slotName ? slotName.content : `default`;
            } else {
                hasDynamicSlots = true;
            }
            const slotFunction = buildSlotFn(slotProps, slotChildren, slotLoc);
            let vIf;
            let vElse;
            let vFor;
            if (vIf = findDir(slotElement, 'if')) {
                hasDynamicSlots = true;
                dynamicSlots.push(createConditionalExpression(vIf.exp, buildDynamicSlot(slotName, slotFunction), defaultFallback));
            } else if (vElse = findDir(slotElement, /^else(-if)?$/, true)) {
                let j = i;
                let prev;
                while(j--){
                    prev = children[j];
                    if (prev.type !== 3) {
                        break;
                    }
                }
                if (prev && isTemplateNode(prev) && findDir(prev, 'if')) {
                    children.splice(i, 1);
                    i--;
                    let conditional = dynamicSlots[dynamicSlots.length - 1];
                    while(conditional.alternate.type === 19){
                        conditional = conditional.alternate;
                    }
                    conditional.alternate = vElse.exp ? createConditionalExpression(vElse.exp, buildDynamicSlot(slotName, slotFunction), defaultFallback) : buildDynamicSlot(slotName, slotFunction);
                } else {
                    context.onError(createCompilerError(29, vElse.loc));
                }
            } else if (vFor = findDir(slotElement, 'for')) {
                hasDynamicSlots = true;
                const parseResult = vFor.parseResult || parseForExpression(vFor.exp, context);
                if (parseResult) {
                    dynamicSlots.push(createCallExpression(context.helper(RENDER_LIST), [
                        parseResult.source,
                        createFunctionExpression(createForLoopParams(parseResult), buildDynamicSlot(slotName, slotFunction), true)
                    ]));
                } else {
                    context.onError(createCompilerError(31, vFor.loc));
                }
            } else {
                if (staticSlotName) {
                    if (seenSlotNames.has(staticSlotName)) {
                        context.onError(createCompilerError(37, dirLoc));
                        continue;
                    }
                    seenSlotNames.add(staticSlotName);
                    if (staticSlotName === 'default') {
                        hasNamedDefaultSlot = true;
                    }
                }
                slotsProperties.push(createObjectProperty(slotName, slotFunction));
            }
        }
        if (!onComponentSlot) {
            if (!hasTemplateSlots) {
                slotsProperties.push(buildDefaultSlotProperty(undefined, children));
            } else if (implicitDefaultChildren.length) {
                if (hasNamedDefaultSlot) {
                    context.onError(createCompilerError(38, implicitDefaultChildren[0].loc));
                } else {
                    slotsProperties.push(buildDefaultSlotProperty(undefined, implicitDefaultChildren));
                }
            }
        }
        const slotFlag = hasDynamicSlots ? 2 : hasForwardedSlots(node.children) ? 3 : 1;
        let slots = createObjectExpression(slotsProperties.concat(createObjectProperty(`_`, createSimpleExpression('' + slotFlag, false))), loc);
        if (dynamicSlots.length) {
            slots = createCallExpression(context.helper(CREATE_SLOTS), [
                slots,
                createArrayExpression(dynamicSlots)
            ]);
        }
        return {
            slots,
            hasDynamicSlots
        };
    }
    function buildDynamicSlot(name, fn) {
        return createObjectExpression([
            createObjectProperty(`name`, name),
            createObjectProperty(`fn`, fn)
        ]);
    }
    function hasForwardedSlots(children) {
        for(let i = 0; i < children.length; i++){
            const child = children[i];
            if (child.type === 1) {
                if (child.tagType === 2 || child.tagType === 0 && hasForwardedSlots(child.children)) {
                    return true;
                }
            }
        }
        return false;
    }
    const directiveImportMap = new WeakMap();
    const transformElement = (node, context)=>{
        if (!(node.type === 1 && (node.tagType === 0 || node.tagType === 1))) {
            return;
        }
        return function postTransformElement() {
            const { tag , props  } = node;
            const isComponent = node.tagType === 1;
            const vnodeTag = isComponent ? resolveComponentType(node, context) : `"${tag}"`;
            const isDynamicComponent = isObject(vnodeTag) && vnodeTag.callee === RESOLVE_DYNAMIC_COMPONENT;
            let vnodeProps;
            let vnodeChildren;
            let vnodePatchFlag;
            let patchFlag = 0;
            let vnodeDynamicProps;
            let dynamicPropNames;
            let vnodeDirectives;
            let shouldUseBlock = isDynamicComponent || vnodeTag === TELEPORT || vnodeTag === SUSPENSE || !isComponent && (tag === 'svg' || tag === 'foreignObject' || findProp(node, 'key', true));
            if (props.length > 0) {
                const propsBuildResult = buildProps(node, context);
                vnodeProps = propsBuildResult.props;
                patchFlag = propsBuildResult.patchFlag;
                dynamicPropNames = propsBuildResult.dynamicPropNames;
                const directives = propsBuildResult.directives;
                vnodeDirectives = directives && directives.length ? createArrayExpression(directives.map((dir)=>buildDirectiveArgs(dir, context)
                )) : undefined;
            }
            if (node.children.length > 0) {
                if (vnodeTag === KEEP_ALIVE) {
                    shouldUseBlock = true;
                    patchFlag |= 1024;
                    if (node.children.length > 1) {
                        context.onError(createCompilerError(44, {
                            start: node.children[0].loc.start,
                            end: node.children[node.children.length - 1].loc.end,
                            source: ''
                        }));
                    }
                }
                const shouldBuildAsSlots = isComponent && vnodeTag !== TELEPORT && vnodeTag !== KEEP_ALIVE;
                if (shouldBuildAsSlots) {
                    const { slots , hasDynamicSlots  } = buildSlots(node, context);
                    vnodeChildren = slots;
                    if (hasDynamicSlots) {
                        patchFlag |= 1024;
                    }
                } else if (node.children.length === 1 && vnodeTag !== TELEPORT) {
                    const child = node.children[0];
                    const type = child.type;
                    const hasDynamicTextChild = type === 5 || type === 8;
                    if (hasDynamicTextChild && !getStaticType(child)) {
                        patchFlag |= 1;
                    }
                    if (hasDynamicTextChild || type === 2) {
                        vnodeChildren = child;
                    } else {
                        vnodeChildren = node.children;
                    }
                } else {
                    vnodeChildren = node.children;
                }
            }
            if (patchFlag !== 0) {
                {
                    if (patchFlag < 0) {
                        vnodePatchFlag = patchFlag + ` /* ${PatchFlagNames[patchFlag]} */`;
                    } else {
                        const flagNames = Object.keys(PatchFlagNames).map(Number).filter((n)=>n > 0 && patchFlag & n
                        ).map((n)=>PatchFlagNames[n]
                        ).join(`, `);
                        vnodePatchFlag = patchFlag + ` /* ${flagNames} */`;
                    }
                }
                if (dynamicPropNames && dynamicPropNames.length) {
                    vnodeDynamicProps = stringifyDynamicPropNames(dynamicPropNames);
                }
            }
            node.codegenNode = createVNodeCall(context, vnodeTag, vnodeProps, vnodeChildren, vnodePatchFlag, vnodeDynamicProps, vnodeDirectives, !!shouldUseBlock, false, node.loc);
        };
    };
    function resolveComponentType(node, context, ssr = false) {
        const { tag  } = node;
        const isProp = node.tag === 'component' ? findProp(node, 'is') : findDir(node, 'is');
        if (isProp) {
            const exp = isProp.type === 6 ? isProp.value && createSimpleExpression(isProp.value.content, true) : isProp.exp;
            if (exp) {
                return createCallExpression(context.helper(RESOLVE_DYNAMIC_COMPONENT), [
                    exp
                ]);
            }
        }
        const builtIn = isCoreComponent(tag) || context.isBuiltInComponent(tag);
        if (builtIn) {
            if (!ssr) context.helper(builtIn);
            return builtIn;
        }
        if (context.bindingMetadata[tag] === 'setup') {
            return `$setup[${JSON.stringify(tag)}]`;
        }
        context.helper(RESOLVE_COMPONENT);
        context.components.add(tag);
        return toValidAssetId(tag, `component`);
    }
    function buildProps(node, context, props = node.props, ssr = false) {
        const { tag , loc: elementLoc  } = node;
        const isComponent = node.tagType === 1;
        let properties = [];
        const mergeArgs = [];
        const runtimeDirectives = [];
        let patchFlag = 0;
        let hasRef = false;
        let hasClassBinding = false;
        let hasStyleBinding = false;
        let hasHydrationEventBinding = false;
        let hasDynamicKeys = false;
        let hasVnodeHook = false;
        const dynamicPropNames = [];
        const analyzePatchFlag = ({ key , value  })=>{
            if (isStaticExp(key)) {
                const name = key.content;
                const isEventHandler = isOn(name);
                if (!isComponent && isEventHandler && name.toLowerCase() !== 'onclick' && name !== 'onUpdate:modelValue' && !isReservedProp(name)) {
                    hasHydrationEventBinding = true;
                }
                if (isEventHandler && isReservedProp(name)) {
                    hasVnodeHook = true;
                }
                if (value.type === 20 || (value.type === 4 || value.type === 8) && getStaticType(value) > 0) {
                    return;
                }
                if (name === 'ref') {
                    hasRef = true;
                } else if (name === 'class' && !isComponent) {
                    hasClassBinding = true;
                } else if (name === 'style' && !isComponent) {
                    hasStyleBinding = true;
                } else if (name !== 'key' && !dynamicPropNames.includes(name)) {
                    dynamicPropNames.push(name);
                }
            } else {
                hasDynamicKeys = true;
            }
        };
        for(let i = 0; i < props.length; i++){
            const prop = props[i];
            if (prop.type === 6) {
                const { loc , name , value  } = prop;
                if (name === 'ref') {
                    hasRef = true;
                }
                if (name === 'is' && tag === 'component') {
                    continue;
                }
                properties.push(createObjectProperty(createSimpleExpression(name, true, getInnerRange(loc, 0, name.length)), createSimpleExpression(value ? value.content : '', true, value ? value.loc : loc)));
            } else {
                const { name , arg , exp , loc  } = prop;
                const isBind = name === 'bind';
                const isOn1 = name === 'on';
                if (name === 'slot') {
                    if (!isComponent) {
                        context.onError(createCompilerError(39, loc));
                    }
                    continue;
                }
                if (name === 'once') {
                    continue;
                }
                if (name === 'is' || isBind && tag === 'component' && isBindKey(arg, 'is')) {
                    continue;
                }
                if (isOn1 && ssr) {
                    continue;
                }
                if (!arg && (isBind || isOn1)) {
                    hasDynamicKeys = true;
                    if (exp) {
                        if (properties.length) {
                            mergeArgs.push(createObjectExpression(dedupeProperties(properties), elementLoc));
                            properties = [];
                        }
                        if (isBind) {
                            mergeArgs.push(exp);
                        } else {
                            mergeArgs.push({
                                type: 14,
                                loc,
                                callee: context.helper(TO_HANDLERS),
                                arguments: [
                                    exp
                                ]
                            });
                        }
                    } else {
                        context.onError(createCompilerError(isBind ? 33 : 34, loc));
                    }
                    continue;
                }
                const directiveTransform = context.directiveTransforms[name];
                if (directiveTransform) {
                    const { props: props1 , needRuntime  } = directiveTransform(prop, node, context);
                    !ssr && props1.forEach(analyzePatchFlag);
                    properties.push(...props1);
                    if (needRuntime) {
                        runtimeDirectives.push(prop);
                        if (isSymbol(needRuntime)) {
                            directiveImportMap.set(prop, needRuntime);
                        }
                    }
                } else {
                    runtimeDirectives.push(prop);
                }
            }
        }
        let propsExpression = undefined;
        if (mergeArgs.length) {
            if (properties.length) {
                mergeArgs.push(createObjectExpression(dedupeProperties(properties), elementLoc));
            }
            if (mergeArgs.length > 1) {
                propsExpression = createCallExpression(context.helper(MERGE_PROPS), mergeArgs, elementLoc);
            } else {
                propsExpression = mergeArgs[0];
            }
        } else if (properties.length) {
            propsExpression = createObjectExpression(dedupeProperties(properties), elementLoc);
        }
        if (hasDynamicKeys) {
            patchFlag |= 16;
        } else {
            if (hasClassBinding) {
                patchFlag |= 2;
            }
            if (hasStyleBinding) {
                patchFlag |= 4;
            }
            if (dynamicPropNames.length) {
                patchFlag |= 8;
            }
            if (hasHydrationEventBinding) {
                patchFlag |= 32;
            }
        }
        if ((patchFlag === 0 || patchFlag === 32) && (hasRef || hasVnodeHook || runtimeDirectives.length > 0)) {
            patchFlag |= 512;
        }
        return {
            props: propsExpression,
            directives: runtimeDirectives,
            patchFlag,
            dynamicPropNames
        };
    }
    function dedupeProperties(properties) {
        const knownProps = new Map();
        const deduped = [];
        for(let i = 0; i < properties.length; i++){
            const prop = properties[i];
            if (prop.key.type === 8 || !prop.key.isStatic) {
                deduped.push(prop);
                continue;
            }
            const name = prop.key.content;
            const existing = knownProps.get(name);
            if (existing) {
                if (name === 'style' || name === 'class' || name.startsWith('on')) {
                    mergeAsArray(existing, prop);
                }
            } else {
                knownProps.set(name, prop);
                deduped.push(prop);
            }
        }
        return deduped;
    }
    function mergeAsArray(existing, incoming) {
        if (existing.value.type === 17) {
            existing.value.elements.push(incoming.value);
        } else {
            existing.value = createArrayExpression([
                existing.value,
                incoming.value
            ], existing.loc);
        }
    }
    function buildDirectiveArgs(dir, context) {
        const dirArgs = [];
        const runtime = directiveImportMap.get(dir);
        if (runtime) {
            dirArgs.push(context.helperString(runtime));
        } else {
            context.helper(RESOLVE_DIRECTIVE);
            context.directives.add(dir.name);
            dirArgs.push(toValidAssetId(dir.name, `directive`));
        }
        const { loc  } = dir;
        if (dir.exp) dirArgs.push(dir.exp);
        if (dir.arg) {
            if (!dir.exp) {
                dirArgs.push(`void 0`);
            }
            dirArgs.push(dir.arg);
        }
        if (Object.keys(dir.modifiers).length) {
            if (!dir.arg) {
                if (!dir.exp) {
                    dirArgs.push(`void 0`);
                }
                dirArgs.push(`void 0`);
            }
            const trueExpression = createSimpleExpression(`true`, false, loc);
            dirArgs.push(createObjectExpression(dir.modifiers.map((modifier)=>createObjectProperty(modifier, trueExpression)
            ), loc));
        }
        return createArrayExpression(dirArgs, dir.loc);
    }
    function stringifyDynamicPropNames(props) {
        let propsNamesString = `[`;
        for(let i = 0, l = props.length; i < l; i++){
            propsNamesString += JSON.stringify(props[i]);
            if (i < l - 1) propsNamesString += ', ';
        }
        return propsNamesString + `]`;
    }
    const transformSlotOutlet = (node, context)=>{
        if (isSlotOutlet(node)) {
            const { children , loc  } = node;
            const { slotName , slotProps  } = processSlotOutlet(node, context);
            const slotArgs = [
                context.prefixIdentifiers ? `_ctx.$slots` : `$slots`,
                slotName
            ];
            if (slotProps) {
                slotArgs.push(slotProps);
            }
            if (children.length) {
                if (!slotProps) {
                    slotArgs.push(`{}`);
                }
                slotArgs.push(createFunctionExpression([], children, false, false, loc));
            }
            node.codegenNode = createCallExpression(context.helper(RENDER_SLOT), slotArgs, loc);
        }
    };
    function processSlotOutlet(node, context) {
        let slotName = `"default"`;
        let slotProps = undefined;
        const name = findProp(node, 'name');
        if (name) {
            if (name.type === 6 && name.value) {
                slotName = JSON.stringify(name.value.content);
            } else if (name.type === 7 && name.exp) {
                slotName = name.exp;
            }
        }
        const propsWithoutName = name ? node.props.filter((p1)=>p1 !== name
        ) : node.props;
        if (propsWithoutName.length > 0) {
            const { props , directives  } = buildProps(node, context, propsWithoutName);
            slotProps = props;
            if (directives.length) {
                context.onError(createCompilerError(35, directives[0].loc));
            }
        }
        return {
            slotName,
            slotProps
        };
    }
    const fnExpRE = /^\s*([\w$_]+|\([^)]*?\))\s*=>|^\s*function(?:\s+[\w$]+)?\s*\(/;
    const transformOn = (dir, node, context, augmentor)=>{
        const { loc , modifiers , arg  } = dir;
        if (!dir.exp && !modifiers.length) {
            context.onError(createCompilerError(34, loc));
        }
        let eventName;
        if (arg.type === 4) {
            if (arg.isStatic) {
                const rawName = arg.content;
                eventName = createSimpleExpression(toHandlerKey(camelize(rawName)), true, arg.loc);
            } else {
                eventName = createCompoundExpression([
                    `${context.helperString(TO_HANDLER_KEY)}(`,
                    arg,
                    `)`
                ]);
            }
        } else {
            eventName = arg;
            eventName.children.unshift(`${context.helperString(TO_HANDLER_KEY)}(`);
            eventName.children.push(`)`);
        }
        let exp = dir.exp;
        if (exp && !exp.content.trim()) {
            exp = undefined;
        }
        let isCacheable = context.cacheHandlers && !exp;
        if (exp) {
            const isMemberExp = isMemberExpression(exp.content);
            const isInlineStatement = !(isMemberExp || /^\s*([\w$_]+|\([^)]*?\))\s*=>|^\s*function(?:\s+[\w$]+)?\s*\(/.test(exp.content));
            const hasMultipleStatements = exp.content.includes(`;`);
            {
                validateBrowserExpression(exp, context, false, hasMultipleStatements);
            }
            if (isInlineStatement || isCacheable && isMemberExp) {
                exp = createCompoundExpression([
                    `${isInlineStatement ? `$event` : `(...args)`} => ${hasMultipleStatements ? `{` : `(`}`,
                    exp,
                    hasMultipleStatements ? `}` : `)`
                ]);
            }
        }
        let ret = {
            props: [
                createObjectProperty(eventName, exp || createSimpleExpression(`() => {}`, false, loc))
            ]
        };
        if (augmentor) {
            ret = augmentor(ret);
        }
        if (isCacheable) {
            ret.props[0].value = context.cache(ret.props[0].value);
        }
        return ret;
    };
    const transformBind = (dir, node, context)=>{
        const { exp , modifiers , loc  } = dir;
        const arg = dir.arg;
        if (arg.type !== 4) {
            arg.children.unshift(`(`);
            arg.children.push(`) || ""`);
        } else if (!arg.isStatic) {
            arg.content = `${arg.content} || ""`;
        }
        if (modifiers.includes('camel')) {
            if (arg.type === 4) {
                if (arg.isStatic) {
                    arg.content = camelize(arg.content);
                } else {
                    arg.content = `${context.helperString(CAMELIZE)}(${arg.content})`;
                }
            } else {
                arg.children.unshift(`${context.helperString(CAMELIZE)}(`);
                arg.children.push(`)`);
            }
        }
        if (!exp || exp.type === 4 && !exp.content.trim()) {
            context.onError(createCompilerError(33, loc));
            return {
                props: [
                    createObjectProperty(arg, createSimpleExpression('', true, loc))
                ]
            };
        }
        return {
            props: [
                createObjectProperty(arg, exp)
            ]
        };
    };
    const transformText = (node, context)=>{
        if (node.type === 0 || node.type === 1 || node.type === 11 || node.type === 10) {
            return ()=>{
                const children = node.children;
                let currentContainer = undefined;
                let hasText = false;
                for(let i = 0; i < children.length; i++){
                    const child = children[i];
                    if (isText(child)) {
                        hasText = true;
                        for(let j = i + 1; j < children.length; j++){
                            const next = children[j];
                            if (isText(next)) {
                                if (!currentContainer) {
                                    currentContainer = children[i] = {
                                        type: 8,
                                        loc: child.loc,
                                        children: [
                                            child
                                        ]
                                    };
                                }
                                currentContainer.children.push(` + `, next);
                                children.splice(j, 1);
                                j--;
                            } else {
                                currentContainer = undefined;
                                break;
                            }
                        }
                    }
                }
                if (!hasText || children.length === 1 && (node.type === 0 || node.type === 1 && node.tagType === 0)) {
                    return;
                }
                for(let i1 = 0; i1 < children.length; i1++){
                    const child = children[i1];
                    if (isText(child) || child.type === 8) {
                        const callArgs = [];
                        if (child.type !== 2 || child.content !== ' ') {
                            callArgs.push(child);
                        }
                        if (!context.ssr && child.type !== 2) {
                            callArgs.push(`${1} /* ${PatchFlagNames[1]} */`);
                        }
                        children[i1] = {
                            type: 12,
                            content: child,
                            loc: child.loc,
                            codegenNode: createCallExpression(context.helper(CREATE_TEXT), callArgs)
                        };
                    }
                }
            };
        }
    };
    const seen = new WeakSet();
    const transformOnce = (node, context)=>{
        if (node.type === 1 && findDir(node, 'once', true)) {
            if (seen.has(node)) {
                return;
            }
            seen.add(node);
            context.helper(SET_BLOCK_TRACKING);
            return ()=>{
                const cur = context.currentNode;
                if (cur.codegenNode) {
                    cur.codegenNode = context.cache(cur.codegenNode, true);
                }
            };
        }
    };
    const transformModel = (dir, node, context)=>{
        const { exp , arg  } = dir;
        if (!exp) {
            context.onError(createCompilerError(40, dir.loc));
            return createTransformProps();
        }
        const expString = exp.type === 4 ? exp.content : exp.loc.source;
        if (!isMemberExpression(expString)) {
            context.onError(createCompilerError(41, exp.loc));
            return createTransformProps();
        }
        const propName = arg ? arg : createSimpleExpression('modelValue', true);
        const eventName = arg ? isStaticExp(arg) ? `onUpdate:${arg.content}` : createCompoundExpression([
            '\"onUpdate:\" + ',
            arg
        ]) : `onUpdate:modelValue`;
        const props = [
            createObjectProperty(propName, dir.exp),
            createObjectProperty(eventName, createCompoundExpression([
                `$event => (`,
                exp,
                ` = $event)`
            ]))
        ];
        if (dir.modifiers.length && node.tagType === 1) {
            const modifiers = dir.modifiers.map((m)=>(isSimpleIdentifier(m) ? m : JSON.stringify(m)) + `: true`
            ).join(`, `);
            const modifiersKey = arg ? isStaticExp(arg) ? `${arg.content}Modifiers` : createCompoundExpression([
                arg,
                ' + \"Modifiers\"'
            ]) : `modelModifiers`;
            props.push(createObjectProperty(modifiersKey, createSimpleExpression(`{ ${modifiers} }`, false, dir.loc, true)));
        }
        return createTransformProps(props);
    };
    function createTransformProps(props = []) {
        return {
            props
        };
    }
    function getBaseTransformPreset(prefixIdentifiers) {
        return [
            [
                transformOnce,
                transformIf,
                transformFor,
                ...[
                    transformExpression
                ],
                transformSlotOutlet,
                transformElement,
                trackSlotScopes,
                transformText
            ],
            {
                on: transformOn,
                bind: transformBind,
                model: transformModel
            }
        ];
    }
    function baseCompile(template, options = {
    }) {
        const onError = options.onError || defaultOnError;
        const isModuleMode = options.mode === 'module';
        {
            if (options.prefixIdentifiers === true) {
                onError(createCompilerError(45));
            } else if (isModuleMode) {
                onError(createCompilerError(46));
            }
        }
        const prefixIdentifiers = !true;
        if (options.cacheHandlers) {
            onError(createCompilerError(47));
        }
        if (options.scopeId && !isModuleMode) {
            onError(createCompilerError(48));
        }
        const ast = isString(template) ? baseParse(template, options) : template;
        const [nodeTransforms, directiveTransforms] = getBaseTransformPreset();
        transform(ast, extend({
        }, options, {
            prefixIdentifiers,
            nodeTransforms: [
                ...nodeTransforms,
                ...options.nodeTransforms || []
            ],
            directiveTransforms: extend({
            }, directiveTransforms, options.directiveTransforms || {
            })
        }));
        return generate(ast, extend({
        }, options, {
            prefixIdentifiers
        }));
    }
    const noopDirectiveTransform = ()=>({
            props: []
        })
    ;
    const V_MODEL_RADIO = Symbol(`vModelRadio`);
    const V_MODEL_CHECKBOX = Symbol(`vModelCheckbox`);
    const V_MODEL_TEXT = Symbol(`vModelText`);
    const V_MODEL_SELECT = Symbol(`vModelSelect`);
    const V_MODEL_DYNAMIC = Symbol(`vModelDynamic`);
    const V_ON_WITH_MODIFIERS = Symbol(`vOnModifiersGuard`);
    const V_ON_WITH_KEYS = Symbol(`vOnKeysGuard`);
    const V_SHOW = Symbol(`vShow`);
    const TRANSITION$1 = Symbol(`Transition`);
    const TRANSITION_GROUP = Symbol(`TransitionGroup`);
    registerRuntimeHelpers({
        [V_MODEL_RADIO]: `vModelRadio`,
        [V_MODEL_CHECKBOX]: `vModelCheckbox`,
        [V_MODEL_TEXT]: `vModelText`,
        [V_MODEL_SELECT]: `vModelSelect`,
        [V_MODEL_DYNAMIC]: `vModelDynamic`,
        [V_ON_WITH_MODIFIERS]: `withModifiers`,
        [V_ON_WITH_KEYS]: `withKeys`,
        [V_SHOW]: `vShow`,
        [TRANSITION$1]: `Transition`,
        [TRANSITION_GROUP]: `TransitionGroup`
    });
    let decoder;
    function decodeHtmlBrowser(raw) {
        (decoder || (decoder = document.createElement('div'))).innerHTML = raw;
        return decoder.textContent;
    }
    const isRawTextContainer = makeMap('style,iframe,script,noscript', true);
    const parserOptions = {
        isVoidTag,
        isNativeTag: (tag)=>isHTMLTag(tag) || isSVGTag(tag)
        ,
        isPreTag: (tag)=>tag === 'pre'
        ,
        decodeEntities: decodeHtmlBrowser,
        isBuiltInComponent: (tag)=>{
            if (isBuiltInType(tag, `Transition`)) {
                return TRANSITION$1;
            } else if (isBuiltInType(tag, `TransitionGroup`)) {
                return TRANSITION_GROUP;
            }
        },
        getNamespace (tag, parent) {
            let ns = parent ? parent.ns : 0;
            if (parent && ns === 2) {
                if (parent.tag === 'annotation-xml') {
                    if (tag === 'svg') {
                        return 1;
                    }
                    if (parent.props.some((a)=>a.type === 6 && a.name === 'encoding' && a.value != null && (a.value.content === 'text/html' || a.value.content === 'application/xhtml+xml')
                    )) {
                        ns = 0;
                    }
                } else if (/^m(?:[ions]|text)$/.test(parent.tag) && tag !== 'mglyph' && tag !== 'malignmark') {
                    ns = 0;
                }
            } else if (parent && ns === 1) {
                if (parent.tag === 'foreignObject' || parent.tag === 'desc' || parent.tag === 'title') {
                    ns = 0;
                }
            }
            if (ns === 0) {
                if (tag === 'svg') {
                    return 1;
                }
                if (tag === 'math') {
                    return 2;
                }
            }
            return ns;
        },
        getTextMode ({ tag , ns  }) {
            if (ns === 0) {
                if (tag === 'textarea' || tag === 'title') {
                    return 1;
                }
                if (isRawTextContainer(tag)) {
                    return 2;
                }
            }
            return 0;
        }
    };
    const transformStyle = (node)=>{
        if (node.type === 1) {
            node.props.forEach((p1, i)=>{
                if (p1.type === 6 && p1.name === 'style' && p1.value) {
                    node.props[i] = {
                        type: 7,
                        name: `bind`,
                        arg: createSimpleExpression(`style`, true, p1.loc),
                        exp: parseInlineCSS(p1.value.content, p1.loc),
                        modifiers: [],
                        loc: p1.loc
                    };
                }
            });
        }
    };
    const parseInlineCSS = (cssText, loc)=>{
        const normalized = parseStringStyle(cssText);
        return createSimpleExpression(JSON.stringify(normalized), false, loc, true);
    };
    function createDOMCompilerError(code, loc) {
        return createCompilerError(code, loc, DOMErrorMessages);
    }
    const DOMErrorMessages = {
        [49]: `v-html is missing expression.`,
        [50]: `v-html will override element children.`,
        [51]: `v-text is missing expression.`,
        [52]: `v-text will override element children.`,
        [53]: `v-model can only be used on <input>, <textarea> and <select> elements.`,
        [54]: `v-model argument is not supported on plain elements.`,
        [55]: `v-model cannot be used on file inputs since they are read-only. Use a v-on:change listener instead.`,
        [56]: `Unnecessary value binding used alongside v-model. It will interfere with v-model's behavior.`,
        [57]: `v-show is missing expression.`,
        [58]: `<Transition> expects exactly one child element or component.`,
        [59]: `Tags with side effect (<script> and <style>) are ignored in client component templates.`
    };
    const transformVHtml = (dir, node, context)=>{
        const { exp , loc  } = dir;
        if (!exp) {
            context.onError(createDOMCompilerError(49, loc));
        }
        if (node.children.length) {
            context.onError(createDOMCompilerError(50, loc));
            node.children.length = 0;
        }
        return {
            props: [
                createObjectProperty(createSimpleExpression(`innerHTML`, true, loc), exp || createSimpleExpression('', true))
            ]
        };
    };
    const transformVText = (dir, node, context)=>{
        const { exp , loc  } = dir;
        if (!exp) {
            context.onError(createDOMCompilerError(51, loc));
        }
        if (node.children.length) {
            context.onError(createDOMCompilerError(52, loc));
            node.children.length = 0;
        }
        return {
            props: [
                createObjectProperty(createSimpleExpression(`textContent`, true), exp ? createCallExpression(context.helperString(TO_DISPLAY_STRING), [
                    exp
                ], loc) : createSimpleExpression('', true))
            ]
        };
    };
    const transformModel$1 = (dir, node, context)=>{
        const baseResult = transformModel(dir, node, context);
        if (!baseResult.props.length || node.tagType === 1) {
            return baseResult;
        }
        if (dir.arg) {
            context.onError(createDOMCompilerError(54, dir.arg.loc));
        }
        function checkDuplicatedValue() {
            const value = findProp(node, 'value');
            if (value) {
                context.onError(createDOMCompilerError(56, value.loc));
            }
        }
        const { tag  } = node;
        const isCustomElement = context.isCustomElement(tag);
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || isCustomElement) {
            let directiveToUse = V_MODEL_TEXT;
            let isInvalidType = false;
            if (tag === 'input' || isCustomElement) {
                const type = findProp(node, `type`);
                if (type) {
                    if (type.type === 7) {
                        directiveToUse = V_MODEL_DYNAMIC;
                    } else if (type.value) {
                        switch(type.value.content){
                            case 'radio':
                                directiveToUse = V_MODEL_RADIO;
                                break;
                            case 'checkbox':
                                directiveToUse = V_MODEL_CHECKBOX;
                                break;
                            case 'file':
                                isInvalidType = true;
                                context.onError(createDOMCompilerError(55, dir.loc));
                                break;
                            default:
                                checkDuplicatedValue();
                                break;
                        }
                    }
                } else if (hasDynamicKeyVBind(node)) {
                    directiveToUse = V_MODEL_DYNAMIC;
                } else {
                    checkDuplicatedValue();
                }
            } else if (tag === 'select') {
                directiveToUse = V_MODEL_SELECT;
            } else {
                checkDuplicatedValue();
            }
            if (!isInvalidType) {
                baseResult.needRuntime = context.helper(directiveToUse);
            }
        } else {
            context.onError(createDOMCompilerError(53, dir.loc));
        }
        baseResult.props = baseResult.props.filter((p1)=>!(p1.key.type === 4 && p1.key.content === 'modelValue')
        );
        return baseResult;
    };
    const isEventOptionModifier = makeMap(`passive,once,capture`);
    const isNonKeyModifier = makeMap(`stop,prevent,self,` + `ctrl,shift,alt,meta,exact,` + `middle`);
    const maybeKeyModifier = makeMap('left,right');
    const isKeyboardEvent = makeMap(`onkeyup,onkeydown,onkeypress`, true);
    const resolveModifiers = (key, modifiers)=>{
        const keyModifiers = [];
        const nonKeyModifiers = [];
        const eventOptionModifiers = [];
        for(let i = 0; i < modifiers.length; i++){
            const modifier = modifiers[i];
            if (isEventOptionModifier(modifier)) {
                eventOptionModifiers.push(modifier);
            } else {
                if (maybeKeyModifier(modifier)) {
                    if (isStaticExp(key)) {
                        if (isKeyboardEvent(key.content)) {
                            keyModifiers.push(modifier);
                        } else {
                            nonKeyModifiers.push(modifier);
                        }
                    } else {
                        keyModifiers.push(modifier);
                        nonKeyModifiers.push(modifier);
                    }
                } else {
                    if (isNonKeyModifier(modifier)) {
                        nonKeyModifiers.push(modifier);
                    } else {
                        keyModifiers.push(modifier);
                    }
                }
            }
        }
        return {
            keyModifiers,
            nonKeyModifiers,
            eventOptionModifiers
        };
    };
    const transformClick = (key, event)=>{
        const isStaticClick = isStaticExp(key) && key.content.toLowerCase() === 'onclick';
        return isStaticClick ? createSimpleExpression(event, true) : key.type !== 4 ? createCompoundExpression([
            `(`,
            key,
            `) === "onClick" ? "${event}" : (`,
            key,
            `)`
        ]) : key;
    };
    const transformOn$1 = (dir, node, context)=>{
        return transformOn(dir, node, context, (baseResult)=>{
            const { modifiers  } = dir;
            if (!modifiers.length) return baseResult;
            let { key , value: handlerExp  } = baseResult.props[0];
            const { keyModifiers , nonKeyModifiers , eventOptionModifiers  } = resolveModifiers(key, modifiers);
            if (nonKeyModifiers.includes('right')) {
                key = transformClick(key, `onContextmenu`);
            }
            if (nonKeyModifiers.includes('middle')) {
                key = transformClick(key, `onMouseup`);
            }
            if (nonKeyModifiers.length) {
                handlerExp = createCallExpression(context.helper(V_ON_WITH_MODIFIERS), [
                    handlerExp,
                    JSON.stringify(nonKeyModifiers)
                ]);
            }
            if (keyModifiers.length && (!isStaticExp(key) || isKeyboardEvent(key.content))) {
                handlerExp = createCallExpression(context.helper(V_ON_WITH_KEYS), [
                    handlerExp,
                    JSON.stringify(keyModifiers)
                ]);
            }
            if (eventOptionModifiers.length) {
                const modifierPostfix = eventOptionModifiers.map(capitalize).join('');
                key = isStaticExp(key) ? createSimpleExpression(`${key.content}${modifierPostfix}`, true) : createCompoundExpression([
                    `(`,
                    key,
                    `) + "${modifierPostfix}"`
                ]);
            }
            return {
                props: [
                    createObjectProperty(key, handlerExp)
                ]
            };
        });
    };
    const transformShow = (dir, node, context)=>{
        const { exp , loc  } = dir;
        if (!exp) {
            context.onError(createDOMCompilerError(57, loc));
        }
        return {
            props: [],
            needRuntime: context.helper(V_SHOW)
        };
    };
    const warnTransitionChildren = (node, context)=>{
        if (node.type === 1 && node.tagType === 1) {
            const component = context.isBuiltInComponent(node.tag);
            if (component === TRANSITION$1) {
                return ()=>{
                    if (node.children.length && hasMultipleChildren(node)) {
                        context.onError(createDOMCompilerError(58, {
                            start: node.children[0].loc.start,
                            end: node.children[node.children.length - 1].loc.end,
                            source: ''
                        }));
                    }
                };
            }
        }
    };
    function hasMultipleChildren(node) {
        const children = node.children = node.children.filter((c)=>c.type !== 3
        );
        const child = children[0];
        return children.length !== 1 || child.type === 11 || child.type === 9 && child.branches.some(hasMultipleChildren);
    }
    const ignoreSideEffectTags = (node, context)=>{
        if (node.type === 1 && node.tagType === 0 && (node.tag === 'script' || node.tag === 'style')) {
            context.onError(createDOMCompilerError(59, node.loc));
            context.removeNode();
        }
    };
    const DOMNodeTransforms = [
        transformStyle,
        ...[
            warnTransitionChildren
        ]
    ];
    const DOMDirectiveTransforms = {
        cloak: noopDirectiveTransform,
        html: transformVHtml,
        text: transformVText,
        model: transformModel$1,
        on: transformOn$1,
        show: transformShow
    };
    function compile$1(template, options = {
    }) {
        return baseCompile(template, extend({
        }, parserOptions, options, {
            nodeTransforms: [
                ignoreSideEffectTags,
                ...DOMNodeTransforms,
                ...options.nodeTransforms || []
            ],
            directiveTransforms: extend({
            }, DOMDirectiveTransforms, options.directiveTransforms || {
            }),
            transformHoist: null
        }));
    }
    initDev();
    const compileCache = Object.create(null);
    function compileToFunction(template, options) {
        if (!isString(template)) {
            if (template.nodeType) {
                template = template.innerHTML;
            } else {
                warn(`invalid template option: `, template);
                return NOOP;
            }
        }
        const key = template;
        const cached = compileCache[template];
        if (cached) {
            return cached;
        }
        if (template[0] === '#') {
            const el = document.querySelector(template);
            if (!el) {
                warn(`Template element not found or is empty: ${template}`);
            }
            template = el ? el.innerHTML : ``;
        }
        const { code  } = compile$1(template, extend({
            hoistStatic: true,
            onError (err) {
                {
                    const message = `Template compilation error: ${err.message}`;
                    const codeFrame = err.loc && generateCodeFrame(template, err.loc.start.offset, err.loc.end.offset);
                    warn(codeFrame ? `${message}\n${codeFrame}` : message);
                }
            }
        }, options));
        const render1 = new Function(code)();
        render1._rc = true;
        return compileCache[key] = render1;
    }
    registerRuntimeCompiler(compileToFunction);
    exports.BaseTransition = BaseTransitionImpl;
    exports.Comment = Comment1;
    exports.Fragment = Fragment;
    exports.KeepAlive = KeepAliveImpl;
    exports.Static = Static;
    exports.Suspense = SuspenseImpl;
    exports.Teleport = TeleportImpl;
    exports.Text = Text1;
    exports.Transition = Transition;
    exports.TransitionGroup = TransitionGroupImpl;
    exports.callWithAsyncErrorHandling = callWithAsyncErrorHandling;
    exports.callWithErrorHandling = callWithErrorHandling;
    exports.camelize = camelize;
    exports.capitalize = capitalize;
    exports.cloneVNode = cloneVNode;
    exports.compile = compileToFunction;
    exports.computed = computed$1;
    exports.createApp = createApp;
    exports.createBlock = createBlock;
    exports.createCommentVNode = createCommentVNode;
    exports.createHydrationRenderer = createHydrationRenderer;
    exports.createRenderer = createRenderer;
    exports.createSSRApp = createSSRApp;
    exports.createSlots = createSlots;
    exports.createStaticVNode = createStaticVNode;
    exports.createTextVNode = createTextVNode;
    exports.createVNode = createVNodeWithArgsTransform;
    exports.customRef = customRef;
    exports.defineAsyncComponent = defineAsyncComponent;
    exports.defineComponent = defineComponent;
    exports.getCurrentInstance = getCurrentInstance;
    exports.getTransitionRawChildren = getTransitionRawChildren;
    exports.h = h;
    exports.handleError = handleError;
    exports.hydrate = hydrate;
    exports.initCustomFormatter = initCustomFormatter;
    exports.inject = inject;
    exports.isProxy = isProxy;
    exports.isReactive = isReactive;
    exports.isReadonly = isReadonly;
    exports.isRef = isRef;
    exports.isVNode = isVNode1;
    exports.markRaw = markRaw;
    exports.mergeProps = mergeProps;
    exports.nextTick = nextTick;
    exports.onActivated = onActivated;
    exports.onBeforeMount = onBeforeMount;
    exports.onBeforeUnmount = onBeforeUnmount;
    exports.onBeforeUpdate = onBeforeUpdate;
    exports.onDeactivated = onDeactivated;
    exports.onErrorCaptured = onErrorCaptured;
    exports.onMounted = onMounted;
    exports.onRenderTracked = onRenderTracked;
    exports.onRenderTriggered = onRenderTriggered;
    exports.onUnmounted = onUnmounted;
    exports.onUpdated = onUpdated;
    exports.openBlock = openBlock;
    exports.popScopeId = popScopeId;
    exports.provide = provide;
    exports.proxyRefs = proxyRefs;
    exports.pushScopeId = pushScopeId;
    exports.queuePostFlushCb = queuePostFlushCb;
    exports.reactive = reactive;
    exports.readonly = readonly;
    exports.ref = ref;
    exports.registerRuntimeCompiler = registerRuntimeCompiler;
    exports.render = render;
    exports.renderList = renderList;
    exports.renderSlot = renderSlot;
    exports.resolveComponent = resolveComponent;
    exports.resolveDirective = resolveDirective;
    exports.resolveDynamicComponent = resolveDynamicComponent;
    exports.resolveTransitionHooks = resolveTransitionHooks;
    exports.setBlockTracking = setBlockTracking;
    exports.setDevtoolsHook = setDevtoolsHook;
    exports.setTransitionHooks = setTransitionHooks;
    exports.shallowReactive = shallowReactive;
    exports.shallowReadonly = shallowReadonly;
    exports.shallowRef = shallowRef;
    exports.ssrContextKey = ssrContextKey;
    exports.ssrUtils = null;
    exports.toDisplayString = toDisplayString;
    exports.toHandlerKey = toHandlerKey;
    exports.toHandlers = toHandlers;
    exports.toRaw = toRaw;
    exports.toRef = toRef;
    exports.toRefs = toRefs;
    exports.transformVNodeArgs = transformVNodeArgs;
    exports.triggerRef = triggerRef;
    exports.unref = unref;
    exports.useCssModule = useCssModule;
    exports.useCssVars = useCssVars;
    exports.useSSRContext = useSSRContext;
    exports.useTransitionState = useTransitionState;
    exports.vModelCheckbox = vModelCheckbox;
    exports.vModelDynamic = vModelDynamic;
    exports.vModelRadio = vModelRadio;
    exports.vModelSelect = vModelSelect;
    exports.vModelText = vModelText;
    exports.vShow = vShow;
    exports.version = "3.0.2";
    exports.warn = warn;
    exports.watch = watch;
    exports.watchEffect = watchEffect;
    exports.withCtx = withCtx;
    exports.withDirectives = withDirectives;
    exports.withKeys = withKeys;
    exports.withModifiers = withModifiers;
    exports.withScopeId = withScopeId;
    return exports;
}({
});
const Sample = {
    data: function() {
        return {
            count: 3
        };
    },
    methods: {
        countUp: function() {
            this.count++;
        },
        countDown: function() {
            this.count--;
        }
    },
    template: `\n    <div>\n      <p>{{ count }}</p>\n      <button @click="countUp">count up</button>\n      <button @click="countDown">count down</button>\n    </div>\n  `
};
const Main = {
    template: `<Sample />`
};
app = Vue.createApp(Main);
app.component("Sample", Sample);
app.mount("#app");
