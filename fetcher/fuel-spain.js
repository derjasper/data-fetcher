var net = require('net');
var request = require('request');
var fs = require('fs');

// Fetches data from http://www.geoportalgasolineras.es, stores it as .geojson file and deploys it to simple-geojson-server

function fetchData(settings, callback) {
      request.get(
        {
          url: 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/',
          headers: {
            'Accept': 'application/json'
          }
        },
        function(error, response, body) {
          if (!error && response.statusCode == 200) {
            var data = body;
            callback(null, data);
          }
          else if (!error) {
            callback(new Error("Status Code: " + response.statusCode), null);
          }
          else {
            callback(error, null);
          }
        });
  }

  function processData(settings, rawData, callback) {
    process.nextTick(function(){
      try {
        var list = JSON.parse(rawData).ListaEESSPrecio;
        var features = [];

        for (var i = 0; i < list.length; i++) {
          /*
          *GPR : Gasolina 95 (G.Protección) // "Precio Gasolina 95 Protección"
          *G98 : Gasolina 98 // "Precio Gasolina  98"
          *GOA : Gasóleo A habitual // "Precio Gasoleo A"
          *NGO : Nuevo gasóleo A // "Precio Nuevo Gasoleo A"
          GOB : Gasóleo B
          GOC : Gasóleo C
          *BIO : Biodiésel // "Precio Biodiesel"
          G95 : Gasolina 95
          *BIE : Bioetanol // "Precio Bioetanol"
          GLP : Gases licuados del petróleo
          *GNC : Gas natural comprimido // "Precio Gas Natural Comprimido"
          */

          // check if entry is suitable
          if (list[i]["Latitud"] == null || list[i]["Longitud (WGS84)"] == null) {
            continue;
          }

          var lat = parseFloat(list[i]["Latitud"].replace(",", "."));
          var lng = parseFloat(list[i]["Longitud (WGS84)"].replace(",", "."));
          var properties = {
            brand: list[i]["Rótulo"],
            address: list[i]["Dirección"],
            place: list[i]["Municipio"],
            state: list[i]["Provincia"],
            openingTimes: list[i]["Horario"],
            price_gpr: list[i]["Precio Gasolina 95 Protección"],
            price_g98: list[i]["Precio Gasolina  98"],
            price_goa: list[i]["Precio Gasoleo A"],
            price_ngo: list[i]["Precio Nuevo Gasoleo A"],
            price_bio: list[i]["Precio Biodiesel"],
            price_bie: list[i]["Precio Bioetanol"],
            price_gnc: list[i]["Precio Gas Natural Comprimido"],
          };

          features.push({
            "type": "Feature",
            "id": i+"",
            "geometry": {
              "type": "Point",
              "coordinates": [lng, lat]
            },
            "properties": properties
          });
        }

        callback(null, {
          "type": "FeatureCollection",
          "features": features
        });
      }
      catch (err) {
        callback(err, null);
      }
    });
  }

  function testData(settings, data, callback) {
    // TODO test
    process.nextTick(function(){
      callback(null, data);
    });
  }

  function deployData(settings, data, callback) {
    fs.writeFile(settings.targetFile, JSON.stringify(data), function (err) {
      if (err) {
        callback(err);
      }
      else {
        try {
          var success = false;
          var client = net.connect(settings.serverSocket, function () {
            client.write("updateService "+settings.serverService);
          });
          client.on('data', function (data) {
            if (data.toString().trim() == "updating service") {
              success = true;
            }
            client.end();
          });
          client.on('error', function(err) {
            callback(err);
          });
          client.on('end', function () {
            if (!success) {
              callback(new Error("Could not force update on simple-geojson-server"));
            }
            else {
              callback(null);
            }
          });
        }
        catch (er) {
          callback(er);
        }
      }
    });
  }

  module.exports = {
    fetch: fetchData,
    process: processData,
    test: testData,
    deploy: deployData
  };
