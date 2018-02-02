var net = require('net')
var request = require('request')
var fs = require('fs')
var unzip = require('unzip')
var xml2js = require('xml2js')
var iconv = require('iconv-lite')

// Fetches data from https://www.prix-carburants.gouv.fr/, stores it as .geojson file and deploys it to simple-geojson-server

function fetchData (settings, callback) {
  var err = false

  try {
    var r = request
      .get({
        url: 'https://donnees.roulez-eco.fr/opendata/instantane',
        encoding: null
      })
      .on('error', function(error) {
        // do nothing, ignore faulty response header errors
      })
      .on('response', function(resp) {
        if(resp.statusCode === 200) {
           r.pipe(unzip.Parse())
             .on('error', function(error) {
               err = true
               callback(error, null)
             })
             .on('entry', function (entry) {
               if (entry.type == "File" && entry.path === "PrixCarburants_instantane.xml") {
                 const chunks = []
                 entry.on('data', function(data) {
                   chunks.push(data);
                 }).on('end', function () {
                   if (!err) {
                     data = Buffer.concat(chunks)
                     data = iconv.decode(data, 'iso-8859-1');
                     callback(null, data)
                   }
                 })
               } else {
                 entry.autodrain();
               }
             })

           r.resume()
        } else {
          callback(new Error('Status Code: ' + resp.statusCode), null)
        }
      })
    } catch(error) {
      err = true
      callback(error, null)
    }
}

function processData (settings, rawData, callback) {
  process.nextTick(function () {
    function jsonToGeojson(result) {
      function getPrice(entry, type) {
        for (var i = 0; entry['prix'] && i < entry['prix'].length; i++) {
          if (entry['prix'][i]['$']['nom'] === type) {
            return {
              price: entry['prix'][i]['$']['valeur'],
              lastUpdate: entry['prix'][i]['$']['maj']
            }
          }
        }
        return {
          price: null,
          lastUpdate: null
        }
      }

      var list = result.pdv_liste.pdv

      var features = []

      for (var i = 0; i < list.length; i++) {
        var lat = parseFloat(list[i]['$']['latitude']) / 100000
        var lng = parseFloat(list[i]['$']['longitude']) / 100000

        var properties = {
          postCode: list[i]['$']['cp'],
          address: list[i]['adresse'][0],
          place: list[i]['ville'][0],
          // TODO isOpen
          openingTimes: {
            text: "tous les jours" + (list[i]['ouverture'][0]['$']['saufjour'] !=="" ? (" sauf " + list[i]['ouverture'][0]['$']['saufjour']) : ""),
            start: list[i]['ouverture'][0]['$']['debut'],
            end: list[i]['ouverture'][0]['$']['fin']
          },
          // Gazole, SP95, SP98, GPLc, E10, E85
          price_gazole: getPrice(list[i],"Gazole").price,
          price_sp95: getPrice(list[i],"SP95").price,
          price_sp98: getPrice(list[i],"SP98").price,
          price_gplc: getPrice(list[i],"GPLc").price,
          price_e10: getPrice(list[i],"E10").price,
          price_e85: getPrice(list[i],"E85").price,
          lastUpdate_gazole: getPrice(list[i],"Gazole").lastUpdate,
          lastUpdate_sp95: getPrice(list[i],"SP95").lastUpdate,
          lastUpdate_sp98: getPrice(list[i],"SP98").lastUpdate,
          lastUpdate_gplc: getPrice(list[i],"GPLc").lastUpdate,
          lastUpdate_e10: getPrice(list[i],"E10").lastUpdate,
          lastUpdate_e85: getPrice(list[i],"E85").lastUpdate
        }

        features.push({
          'type': 'Feature',
          'id': i + '',
          'geometry': {
            'type': 'Point',
            'coordinates': [lng, lat]
          },
          'properties': properties
        })
      }

      callback(null, {
        'type': 'FeatureCollection',
        'features': features
      })
    }

    xml2js.parseString(rawData, function(err, result) {
      if (err) {
        callback(err, null)
      } else {
        //console.dir(result.pdv_liste.pdv)
        jsonToGeojson(result)
      }
    })
  })
}

function testData (settings, data, callback) {
  process.nextTick(function () {
    if (data.features.length === 0) {
      callback(new Error('Empty result!'), data)
    } else {
      callback(null, data)
    }
  })
}

function deployData (settings, data, callback) {
  fs.writeFile(settings.targetFile, JSON.stringify(data), function (err) {
    if (err) {
      callback(err)
    } else {
      try {
        var success = false
        var client = net.connect(settings.serverSocket, function () {
          client.write('updateService ' + settings.serverService)
        })
        client.on('data', function (data) {
          if (data.toString().trim() === 'updating service') {
            success = true
          }
          client.end()
        })
        client.on('error', function (err) {
          callback(err)
        })
        client.on('end', function () {
          if (!success) {
            callback(new Error('Could not force update on simple-geojson-server'))
          } else {
            callback(null)
          }
        })
      } catch (er) {
        callback(er)
      }
    }
  })
}

module.exports = {
  fetch: fetchData,
  process: processData,
  test: testData,
  deploy: deployData
}
