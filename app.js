var schedule = require('node-schedule');

var plugins = {
  "fuelSpain": require('./fetcher/fuel-spain.js')
};

var config = {
  "mail": "",
  "fetcher": {
    "fuelSpain": {
      settings: {
        targetFile: "../simple-geojson-server/data/fuelSpain.geojson",
        serverSocket: "/tmp/simple-geojson-server.sock",
        serverService: "fuelSpain"
      },
      schedule: {
        hour: 5
      }
    }
  }
};

// TODO settings manager
// TODO plugin manager
// TODO move deploy-step out of fetcher

// process args
var runOnce = false;
if (process.argv.length >= 3 && process.argv[2].trim() == "run-once") {
  runOnce = true;
}

console.log("Starting fetcher");

for (var key in config.fetcher) {
  if (!runOnce) {
    schedule.scheduleJob(config.fetcher[key].schedule, function(){
      run(key);
    });
  }
  else {
    run(key);
  }
}

function run(plugin) {
  console.log("["+plugin+"]", "Run");
  // settings
  var settings = config.fetcher[plugin].settings;
  // fetch data
  console.log("["+plugin+"]", "Fetch...");
  plugins[plugin].fetch(settings,function(err,data) {
    if (err) {
      handleError(plugin, "Fetch failed", err);
    }
    else {
      console.log("["+plugin+"]", "Process...");
      plugins[plugin].process(settings,data, function(err,data) {
        if (err) {
          handleError(plugin, "Process failed", err);
        }
        else {
          console.log("["+plugin+"]", "Test...");
          plugins[plugin].test(settings,data, function(err, data) {
            if (err) {
              handleError(plugin, "Test failed", err);
            }
            else {
              console.log("["+plugin+"]", "Deploy...");
              plugins[plugin].deploy(settings,data, function(err) {
                if (err) {
                  handleError(plugin, "Deploy failed", err);
                }
                else {
                  console.log("["+plugin+"]", "Finished");
                }
              });
            }
          });
        }
      });
    }
  });
}

function handleError(plugin, text, err) {
  console.error("["+plugin+"]", "Error: " + text + ": ", err);
  // TODO send mail
}
