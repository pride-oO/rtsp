# RTSP Server:
rtsp media server

# This package uses the following packages:
* node:events
* node:crypto
* node:dgram
* node:net

## Support protocol:
* TCP
* UDP

## Testing:
* tcp->tcp
* udp->udp
* tcp->udp
* udp->tcp

## Usage:
```javascript

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
     * Event connection new client
     * @event connect
     */
    rtspServer.on('connect', (clientObject) => {

        clientObject.on('RTSP:command', (command, data) => {
            console.debug('RTSP:command', command, clientObject.getID(), data);
        });

        clientObject.on('write', (message, isCommand) => {
            if(isCommand){
                console.debug('write', clientObject.getID(), message);
            }

        });

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
```
