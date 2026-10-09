import ballerina/http;

service /inventory on new http:Listener(9090) {
    resource function get items() returns json[] {
        return [];
    }
}
