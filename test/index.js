const RTSP_SERVER = require('../index');

(async () => {

    /**
     * Test debug function
     * @param argument
     * @private
     */
    const _debug = (...argument) => {
        console.info.apply(this, ['['+Date.now()+']', ...argument]);
    }

    /**
     * Config server
     * @type {object}
     */
    const CONFIG = {
        // * Port server listen (Default: 544)
        "port" : 5544,
        // * Host server listen (Default: 127.0.0.1)
        "host" : "127.0.0.1",
        // * Name of the server (Use in response header) (Default: RTSP SERVER)
        "serverName" : "RTSP SERVER",
        // * Require request access permission from (method: access(name, callback)) (Default: empty)
        "access" : ["auth", "media"],
        // * Port udp range (Default: 56000-57000)
        "portList" : {
            "start" : 56000,
            "end" : 57000
        }
    };

    // Create server
    const rtspServer = new RTSP_SERVER(CONFIG);

    /**
     * Event error
     * @event listen
     */
    rtspServer.on('error', (name, data) => {
        _debug(
            'event:[error]',
            name,
            data
        );
    });


    /**
     * Event listen server
     * @event listen
     */
    rtspServer.on('listen', () => {
        _debug(
            'event:[listen]',
            'Host: '+rtspServer.getHost(),
            'Port: '+rtspServer.getPort()
        );
    });

    /**
     * Event connection new client
     * @event connect
     */
    rtspServer.on('connect', (clientObject) => {

        /**
         * Event auth client
         * @event auth
         */
        clientObject.on('auth', () => {
            _debug(
                'event:[client|auth]',
                'ID: '+clientObject.getID(),
                'HeaderData: '+clientObject.getHeaderData()
            );
        });

        /**
         * Event create new media object from client
         * @event media
         */
        clientObject.on('media', (mediaObject) => {

            /**
             * Event destroy media object
             */
            mediaObject.once('destroy', () => {
                _debug(
                    'event:[client|media|destroy]',
                    'ID: '+mediaObject.getID(),
                    'Name: '+mediaObject.getName(),
                    'Type: '+mediaObject.getType(),
                    'ClientID: '+clientObject.getID(),
                    'DestroyInfo: '+mediaObject.getDestroy(),
                );
            });

            _debug(
                'event:[client|media|create]',
                'ID: '+mediaObject.getID(),
                'Name: '+mediaObject.getName(),
                'Type: '+mediaObject.getType(), // publish, views
                'ClientID: '+clientObject.getID(),
            );
        });


        /**
         * Event destroy client
         */
        clientObject.on('destroy', () => {
            _debug(
                'event:[client|destroy]',
                'ID: '+clientObject.getID(),
                'DestroyInfo: '+clientObject.getDestroy()
            );
        });

        _debug(
            'event:[client|connect]',
            'ID: '+clientObject.getID()
        );
    });



    /**
     * Client authorization request
     * @param clientObject
     * @returns {Promise<object>|boolean|Error}
     */
    rtspServer.access('auth', async (clientObject) => {
        _debug('request:[access|auth]',
            'ClientID: '+clientObject.getID(),
            'HeaderData: '+clientObject.getHeaderData()
        );
        return true;
    });


    /**
     * Client create media request
     * @param mediaObject
     * @returns {Promise<object>|boolean|Error}
     */
    rtspServer.access('media', async (mediaObject, clientObject) => {
        _debug(
            'request:[access|media]',
            'MediaID: '+mediaObject.getID(),
            'MediaName: '+mediaObject.getName(),
            'MediaType: '+mediaObject.getType(),
            'MediaClientID: '+clientObject.getID(),
        );
        return true;
    });

    // Start listen
    await rtspServer.listen();

})();

/*
## Publish
ffmpeg -re -i test.mp4  -c copy -f rtsp -rtsp_transport udp rtsp://127.0.0.1:5544/test
or
ffmpeg -re -i test.mp4  -c copy -f rtsp -rtsp_transport tcp rtsp://127.0.0.1:5544/test
```

## Views
ffplay -rtsp_transport udp rtsp://127.0.0.1:5544/test
or
ffplay -rtsp_transport tcp rtsp://127.0.0.1:5544/test

*/