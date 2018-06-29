/**
 *
 * # Prerequisite: bitd must be running.
 *
 * # Usage:
 * const bitdb = require('bitdb')
 * bitdb.read({ ... }, function(err, response) {
 *  res.json(response)
 * })
 * 
 * # See examples/app.js for an actual example
 *
 */
const iconv = require('iconv-lite');
const traverse = require('traverse')
const MongoClient = require('mongodb').MongoClient;
const Bitdb = {
  config: {
    url: 'mongodb://localhost:27017',
    dbName: 'bitdb'
  },
  confirmed: function() {
    if (Bitdb._db) {
      return Bitdb._db.collection('confirmed');
    } else {
      throw new Error("Must initialize DB first");
    }
  },
  unconfirmed: function() {
    if (Bitdb._db) {
      return Bitdb._db.collection('unconfirmed');
    } else {
      throw new Error("Must initialize DB first");
    }
  },
  exit: function() {
    Bitdb.mongo.close()
  },
  init: function(options, callback) {
    // Initialize DB
    let url = ( (options && options.url) ? options.url : Bitdb.config.url );
    let dbName = ( (options && options.name) ? options.name : Bitdb.config.dbName );
    MongoClient.connect(url, {useNewUrlParser: true}, function(err, client) {
      if (err) console.log(err)
      Bitdb._db = client.db(dbName);
      Bitdb.mongo = client;
      callback(Bitdb._db)
    })
  },
  encoding: function(subtree, encoding_schema) {
    traverse(subtree).forEach(function(x) {
      if (this.isLeaf) {
        let encoding = "utf8";
        let token = x;
        if (/^0x/i.test(x)) {
          encoding = 'hex';
          token = x.substring(2)
        }
        let newVal = token;

        // if the key is a special directive like '$in', traverse up the tree
        // until we find a normal key that starts with b or s
        let node = this;
        if (/^([0-9]+|\$).*/.test(node.key)) {
          while(!node.isRoot) {
            node = node.parent;
            if (/^b[0-9]+/.test(node.key)) {
              break;
            }
          }
        }

        if (encoding_schema && encoding_schema[node.key]) {
          encoding = encoding_schema[node.key];   
        }

        if (/^b[0-9]+/.test(node.key)) {
          newVal = iconv.encode(token, encoding).toString("base64");
        }
        this.update(newVal)
      }
    })
  },
  /**
  *
  *  bitdb.read({ ... }).then(function(result) {
  *    // do something with the result
  *  })
  */
  read: function(r, cb) {
    /**
    *  r := {
    *    "request": {
    *      "find": {
    *        "b0": "0x6d02"
    *      },
    *      "sort": {
    *        "b1": 1
    *      },
    *      "limit": 50
    *    },
    *    "response": {
    *      "b0": "hex",
    *      "b1": "utf8",
    *      "b2": "hex"
    *    }
    *  }
    **/

    if (!Bitdb._db) {
      Bitdb.init(null, function() {
        Bitdb.read(r, cb)
      })
    } else {
      if (r.request) {
        let query = r.request;
        Bitdb.encoding(query.find, query.encoding)
        Bitdb.encoding(query.aggregate, query.encoding)
        // query
        return Promise.all([
          Bitdb.lookup(r, Bitdb.confirmed()),
          Bitdb.lookup(r, Bitdb.unconfirmed())
        ])
        .then(function(results) {
          cb(null, {
            status: "success",
            confirmed: results[0],
            unconfirmed: results[1]
          })
        })
        .catch(function(err) {
          cb(null, {
            status: "error",
            error: err
          })
        })
      } else {
        cb(null, {
          status: "error",
          error: "The request needs a query object"
        })
      }
    }
  },
  lookup: function(r, collection) {
    let query = r.request;
    return new Promise(function(resolve, reject) {
      let cursor;
      if (query.find || query.aggregate) {
        if (query.find) {
          cursor = collection.find(query.find)
        } else if (query.aggregate) {
          cursor = collection.aggregate(query.aggregate)
        }
        if (query.sort) {
          cursor = cursor.sort(query.sort)
        } else {
          cursor = cursor.sort({block_index: -1})
        }
        if (query.project) {
          cursor = cursor.project(query.project)
        }
        if (query.limit) {
          cursor = cursor.limit(query.limit)
        } else {
          cursor = cursor.limit(100)
        }
        cursor.toArray(function(err, docs) {
          // transform each key in the response object
          let transformed = docs.map(function(doc) {
            let o = doc;
            if (r.response && r.response.encoding) {
              for (let key in r.response.encoding) {
                let encoding = r.response.encoding[key];
                if (doc[key]) {
                  o[key] = iconv.encode(doc[key], "base64").toString(encoding)
                }
              }
            }
            return o;
          })
          resolve(transformed)
        })
      } else if (query.distinct) {
        if (query.distinct.field) {
          collection.distinct(query.distinct.field, query.distinct.query, query.distinct.options).then(function(items) {
            resolve(items)
          })
        }
      }
    })
  }
}
module.exports = {
  init: Bitdb.init,
  exit: Bitdb.exit,
  read: Bitdb.read,
}
