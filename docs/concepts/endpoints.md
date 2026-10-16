# Endpoint ownership and primary ports

An endpoint has an internal `port`, optional host capability `publicPort`, optional URL `scheme`, and one `primary` marker among endpoints of a service. Main's primary internal port sets `PORT`; ordinary endpoint `service` names its actual owner and its primary owner determines the representative. A module may have zero endpoints if it declares `service`. `publicPort` is a capability, and mesh publication remains explicit. See [endpoint properties](../reference/endpoint-properties.md).
