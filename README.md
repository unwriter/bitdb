# Bitdb

Bitdb client

# Install

```
npm install
```

# Usage

- There's only one api: `bitdb.read()`.
- Simply pass a base64 encoded JSON query that follows the Bitdb Query Language spec at https://bitdb.network/#bql

# Example

```
const bitdb = require('bitdb')
bitdb.read({ ... }, function(err, response) {
 res.json(response)
})
```

Also see [examples/app.js](examples/app.js) for an actual example
