import ballerina/http;

service /orders on new http:Listener(9090) {
    resource function get .() returns json[] {
        return [];
    }
}
