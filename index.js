// Allow versions to define whatever supported specs they wish
// Allow versions to add dependencies of any product that supports all specs they selected
// What happens when a product dependency no longer has support for one of the selected specs
//      Disable support for that version
// What happens when a product dependency adds support for a spec that is not selected?
//      Nothing
// What happens when a product dependency drops support for a spec, then adds back support at a later date?
//      Automatically generate spec support based on input and dependencies

const _ = require("lodash");

let debug = false;

// Simple
const SPEC = {
    "V1": "spec1",
    "V2": "spec2",
    "V3": "spec3",
    "V4": "spec4",
};

// Simple "DB" for products
let prodId = 0;
let products = {};
function generateProductId() {
    const idString = `p${prodId}`;
    prodId++;
    return idString;
}

// Simple "DB" for versions
let verId = 0;
let versions = {};
function generateVersionId() {
    const idString = `v${verId}`;
    verId++;
    return idString;
}

/**
 * Calculates compatibility for a product based on its versions and the version's dependencies.
 * @param {string} productId ID of the product.
 * @returns An array of specs that describes the specs that this product is compatible with.
 */
function calculateCompatibility(productId) {
    const product = products[productId];
    const compatibilities = product.versions.reduce((acc, versionId) => {
        const version = versions[versionId];
        if (version.dependencies.length > 0) {
            const depCompatible = _.intersection(...version.dependencies.map((product) => products[product].compatible));
            acc.push(_.intersection(version.supports, depCompatible));
        } else {
            acc.push(version.supports);
        }
        return acc;
    }, []);
    return _.union(...compatibilities);
}

/**
 * Sets the compatibility for a product to some update spec array. Does not determine the validity of the array.
 * All versions which depend on this product will be retrieved and their parent product will have it's compatibility recalculated.
 * @param {string} productId The product ID of the product to be updated.
 * @param {array} newCompats An array of specs describing the new compatibility of passed product ID
 * @param {object} updated An object that hold productId:boolean, describing if the associated product ID has had its compatibility recalculated.
 */
function setCompatibility(productId, newCompats, updated = {}) {
    products[productId].compatible = newCompats;
    updated[productId] = true;
    if (debug) console.log(`Updated ${productId}`, products[productId].compatible, updated);
    for (const ver in versions) {
        const version = versions[ver];
        if (debug) console.log(`Checking ${ver} for updated dependency`, version.dependencies.includes(productId), updated);
        if (version.dependencies.includes(productId) && !updated[version.product]) {
            const newCompat = calculateCompatibility(version.product);
            if (debug) console.log(`${version.product} requires an update since ${ver} depends on ${productId}. New calculated compatibility is`, newCompat, `was`, products[version.product].compatible);
            setCompatibility(version.product, newCompat, updated);
        }
    }
    if (debug) console.log(updated);
}

/**
 * Creates or updates a version and adds it to the product. If the version includes specs that its dependencies do not support, the process will exist.
 * The passed dependencies must be compatibile with all specs in the supports array. The parent product will have its compatibility updated and will trigger
 * a recalculation of compatibilities for all dependencies.
 * @param {string} productId The product ID of the product to be used as the parent for the version
 * @param {string} versionId The version ID to be used. Null or undefined will cause an ID to be generated.
 * @param {array} supports An array of specs that this version wishes to support.
 * @param {array} dependencies The dependencies for this version.
 * @returns The new version id
 */
function putVersion(productId, versionId, supports, dependencies) {
    if (debug) console.log("---------------------------------------------------------------------------------------------------------------");
    const verId = versionId || generateVersionId();
    const compats = dependencies.reduce((compats, product) => {
        compats.push(products[product].compatible);
        return compats;
    }, [supports]);
    const allowed = _.intersection(...compats);
    if (debug) console.log(`${verId} wants to support`, supports, `and it's dependencies allow`, allowed);
    const invalid = _.difference(supports, allowed);
    if (invalid.length > 0) {
        if (debug) console.log(`${verId} cannot be created because it's supplied dependencies are missing support for`, invalid);
        return;
    }
    if (!versionId) products[productId].versions.push(verId);
    versions[verId] = {
        product: productId,
        supports,
        dependencies,
    };
    const newCompat = calculateCompatibility(productId);
    setCompatibility(productId, newCompat);
    return verId;
}

/**
 * Creates a new product.
 * @returns A new product ID
 */
function createProduct() {
    const id = generateProductId();
    products[id] = {
        compatible: [],
        versions: [],
    }
    return id;
}

/**
 * Resets the DB and debug setting.
 */
function reset() {
    debug = false;
    prodId = 0;
    products = {};
    verId = 0;
    versions = {};
}

/**
 * Logs DB info.
 */
function logInfo() {
    console.log("---------------------------------------------------------------------------------------------------------------")
    console.log(products);
    console.log(versions);
}

/**
 * Validates that the db state matches the expected state and ensures that all recorded compatibilites match the actual calculated compatibilities.
 * @param {*} expected the expected DB state as a single object.
 * @returns A result string.
 */
function validate(expected) {
    if (debug) logInfo();
    for (let product in products) {
        const calculated = calculateCompatibility(product);
        const stored = products[product].compatible;
        const difference = _.difference(calculated, stored);
        if (debug) console.log(`${product} compatibility:`, calculated , "record:", stored, "difference:", difference);
        if (difference.length > 0) {
            return "Failed. Mismatch detected.";
        }
    }
    const result = _.isEqual(expected, {
        products,
        versions,
    });
    if (!result) return "Failed. Expected db state does not match the actual state."
    return "Success."
}

// Run tests
async function run() {
    const tests = [
        () => {
            debug = false;
            console.log("Testing that a product with a version can be created.");
            putVersion(createProduct(), null, [SPEC.V1], []);
            return {
                db: {
                    products: {
                        "p0": {
                            compatible: [SPEC.V1],
                            versions: ["v0"]
                        }
                    },
                    versions: {
                        "v0": {
                            product: "p0",
                            supports: [SPEC.V1],
                            dependencies: []
                        }
                    }
                }
            }
        },
        () => {
            debug = false;
            console.log("Testing that a version cannot be created with a dependency that does not support all desired specs.")
            const prod1 = createProduct();
            const prod2 = createProduct();
            putVersion(prod1, null, [SPEC.V1], []);
            putVersion(prod2, null, [SPEC.V1, SPEC.V2], [prod1]);
            return {
                db: {
                    products: {
                        "p0": {
                            compatible: [SPEC.V1],
                            versions: ["v0"]
                        },
                        "p1": {
                            compatible: [],
                            versions: []
                        }
                    },
                    versions: {
                        "v0": {
                            product: "p0",
                            supports: [SPEC.V1],
                            dependencies: []
                        }
                    }
                }
            }
        },
        () => {
            debug = false;
            console.log("Testing that a version can depend on another product.")
            const prod1 = createProduct();
            const prod2 = createProduct();
            putVersion(prod1, null, [SPEC.V1, SPEC.V2], []);
            putVersion(prod2, null, [SPEC.V1, SPEC.V2], [prod1]);
            return {
                db: {
                    products: {
                        "p0": {
                            compatible: [SPEC.V1, SPEC.V2],
                            versions: ["v0"]
                        },
                        "p1": {
                            compatible: [SPEC.V1, SPEC.V2],
                            versions: ["v1"]
                        }
                    },
                    versions: {
                        "v0": {
                            product: "p0",
                            supports: [SPEC.V1, SPEC.V2],
                            dependencies: []
                        },
                        "v1": {
                            product: "p1",
                            supports: [SPEC.V1, SPEC.V2],
                            dependencies: ["p0"]
                        }
                    }
                }
            }
        },
        () => {
            debug = false;
            console.log("Testing that a dependency adding additional spec support does not change the parent.")
            const prod1 = createProduct();
            const prod2 = createProduct();
            putVersion(prod1, null, [SPEC.V1, SPEC.V2], []);
            putVersion(prod2, null, [SPEC.V1, SPEC.V2], [prod1]);
            putVersion(prod1, null, [SPEC.V3, SPEC.V4], []);
            return {
                db: {
                    products: {
                        "p0": {
                            compatible: [SPEC.V1, SPEC.V2, SPEC.V3, SPEC.V4],
                            versions: ["v0", "v2"]
                        },
                        "p1": {
                            compatible: [SPEC.V1, SPEC.V2],
                            versions: ["v1"]
                        }
                    },
                    versions: {
                        "v0": {
                            product: "p0",
                            supports: [SPEC.V1, SPEC.V2],
                            dependencies: []
                        },
                        "v1": {
                            product: "p1",
                            supports: [SPEC.V1, SPEC.V2],
                            dependencies: ["p0"]
                        },
                        "v2": {
                            product: "p0",
                            supports: [SPEC.V3, SPEC.V4],
                            dependencies: []
                        }
                    }
                }
            }
        },
        () => {
            debug = false;
            console.log("Testing that circular dependencies are resolvable through manual updates.")
            const prod1 = createProduct();
            const prod2 = createProduct();
            const v = putVersion(prod1, null, [SPEC.V1], []);
            putVersion(prod2, null, [SPEC.V1], [prod1]);
            putVersion(prod1, v, [SPEC.V1], [prod2]);
            return {
                db: {
                    products: {
                        "p0": {
                            compatible: [SPEC.V1],
                            versions: ["v0"]
                        },
                        "p1": {
                            compatible: [SPEC.V1],
                            versions: ["v1"]
                        }
                    },
                    versions: {
                        "v0": {
                            product: "p0",
                            supports: [SPEC.V1],
                            dependencies: ["p1"]
                        },
                        "v1": {
                            product: "p1",
                            supports: [SPEC.V1],
                            dependencies: ["p0"]
                        }
                    }
                }
            }
        },
        () => {
            debug = false;
            console.log("Testing that a product's spec compatibiility will always match what it's dependencienies and versions support.");
            const prod1 = createProduct();
            const prod2 = createProduct();
            const v = putVersion(prod1, null, [SPEC.V1, SPEC.V2], []);
            putVersion(prod2, null, [SPEC.V1, SPEC.V2], [prod1]);
            putVersion(prod1, v, [SPEC.V1], []);
            return {
                db: {
                    products: {
                        "p0": {
                            compatible: [SPEC.V1],
                            versions: ["v0"]
                        },
                        "p1": {
                            compatible: [SPEC.V1],
                            versions: ["v1"]
                        }
                    },
                    versions: {
                        "v0": {
                            product: "p0",
                            supports: [SPEC.V1],
                            dependencies: []
                        },
                        "v1": {
                            product: "p1",
                            supports: [SPEC.V1, SPEC.V2],
                            dependencies: ["p0"]
                        }
                    }
                }
            }
        },
        () => {
            debug = false;
            console.log("Testing that a product's spec support can be recovered if it's dependencies recover their support.");
            const prod1 = createProduct();
            const prod2 = createProduct();
            const v = putVersion(prod1, null, [SPEC.V1, SPEC.V2], []);
            putVersion(prod2, null, [SPEC.V1, SPEC.V2], [prod1]);
            putVersion(prod1, v, [SPEC.V1], []);
            putVersion(prod1, v, [SPEC.V1, SPEC.V2], []);
            return {
                db: {
                    products: {
                        "p0": {
                            compatible: [SPEC.V1, SPEC.V2],
                            versions: ["v0"]
                        },
                        "p1": {
                            compatible: [SPEC.V1, SPEC.V2],
                            versions: ["v1"]
                        }
                    },
                    versions: {
                        "v0": {
                            product: "p0",
                            supports: [SPEC.V1, SPEC.V2],
                            dependencies: []
                        },
                        "v1": {
                            product: "p1",
                            supports: [SPEC.V1, SPEC.V2],
                            dependencies: ["p0"]
                        }
                    }
                }
            }
        },
        () => {
            debug = false;
            console.log("Testing that a product with multiple versions that cover different specs can be depended on by another product.");
            const prod1 = createProduct();
            putVersion(prod1, null, [SPEC.V1], []);
            putVersion(prod1, null, [SPEC.V2], []);
            putVersion(prod1, null, [SPEC.V3], []);
            putVersion(prod1, null, [SPEC.V4], []);
            const prod2 = createProduct();
            putVersion(prod2, null, [SPEC.V1, SPEC.V2, SPEC.V3, SPEC.V4], [prod1]);
            return {
                db: {
                    products: {
                        "p0": {
                            compatible: [SPEC.V1, SPEC.V2, SPEC.V3, SPEC.V4],
                            versions: ["v0", "v1", "v2", "v3"]
                        },
                        "p1": {
                            compatible: [SPEC.V1, SPEC.V2, SPEC.V3, SPEC.V4],
                            versions: ["v4"]
                        }
                    },
                    versions: {
                        "v0": {
                            product: "p0",
                            supports: [SPEC.V1],
                            dependencies: []
                        },
                        "v1": {
                            product: "p0",
                            supports: [SPEC.V2],
                            dependencies: []
                        },
                        "v2": {
                            product: "p0",
                            supports: [SPEC.V3],
                            dependencies: []
                        },
                        "v3": {
                            product: "p0",
                            supports: [SPEC.V4],
                            dependencies: []
                        },
                        "v4": {
                            product: "p1",
                            supports: [SPEC.V1, SPEC.V2, SPEC.V3, SPEC.V4],
                            dependencies: ["p0"]
                        }
                    }
                }
            }
        },
        () => {
            debug = false;
            console.log("Testing that a missing spec on a dependency will remove support for that spec on the parent.");
            const prod1 = createProduct();
            putVersion(prod1, null, [SPEC.V1], []);
            putVersion(prod1, null, [SPEC.V2], []);
            const v = putVersion(prod1, null, [SPEC.V3], []);
            putVersion(prod1, null, [SPEC.V4], []);
            const prod2 = createProduct();
            putVersion(prod2, null, [SPEC.V1, SPEC.V2, SPEC.V3, SPEC.V4], [prod1]);
            putVersion(prod1, v, [SPEC.V1], []);
            return {
                db: {
                    products: {
                        "p0": {
                            compatible: [SPEC.V1, SPEC.V2, SPEC.V4],
                            versions: ["v0", "v1", "v2", "v3"]
                        },
                        "p1": {
                            compatible: [SPEC.V1, SPEC.V2, SPEC.V4],
                            versions: ["v4"]
                        }
                    },
                    versions: {
                        "v0": {
                            product: "p0",
                            supports: [SPEC.V1],
                            dependencies: []
                        },
                        "v1": {
                            product: "p0",
                            supports: [SPEC.V2],
                            dependencies: []
                        },
                        "v2": {
                            product: "p0",
                            supports: [SPEC.V1],
                            dependencies: []
                        },
                        "v3": {
                            product: "p0",
                            supports: [SPEC.V4],
                            dependencies: []
                        },
                        "v4": {
                            product: "p1",
                            supports: [SPEC.V1, SPEC.V2, SPEC.V3, SPEC.V4],
                            dependencies: ["p0"]
                        }
                    }
                }
            }
        },
    ];

    let index = 1;
    let record = [];
    for (const test of tests) {
        console.log("------------------------------------------------ TEST", index, "-------------------------------------------------------");
        const config = test();
        const result = validate(config.db);
        record.push(`Test ${index}: ${result}`);
        reset();
        index++;
    }

    console.log("---------------------------------------------------------------------------------------------------------------");
    console.log("Test Results:", record);
}

run().catch(console.log).finally(() => {
    process.exit(0);
})