# simple-dependency-tree
A simple thought experiment.

#### Info
A dependency system where products can have versions, and versions support specifications. The program uses a simple "database" to build records for products and versions and attempts to determine the compatibility of each product based on its associated versions, and the product dependencies of those versions. Circular dependencies are not solved for, they are simply not processed. In order to create or update the supported specs for a product with a circular dependency, the circular dependency would need to be broken then recreated. Attempting to add a version which supports specs that its dependencies do not support is impossible and is treated as an error.
