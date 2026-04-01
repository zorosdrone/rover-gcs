from argparse import ArgumentParser

from pymavlink import mavutil


def parse_args() -> ArgumentParser:
    parser = ArgumentParser(
        description="Receive MAVLink heartbeat on VPS for OpenClaw/SITL connectivity checks."
    )
    parser.add_argument(
        "--endpoint",
        default="udpin:0.0.0.0:14550",
        help="MAVLink endpoint to listen on. Default: udpin:0.0.0.0:14550",
    )
    parser.add_argument(
        "--source-system",
        type=int,
        default=10,
        help="Source system id used by this receiver. Default: 10",
    )
    parser.add_argument(
        "--source-component",
        type=int,
        default=90,
        help="Source component id used by this receiver. Default: 90",
    )
    return parser


def main() -> None:
    parser = parse_args()
    args = parser.parse_args()

    print(f"Listening on {args.endpoint}")

    master = mavutil.mavlink_connection(
        args.endpoint,
        source_system=args.source_system,
        source_component=args.source_component,
    )
    master.wait_heartbeat()

    print("connected")
    print(f"target_system={master.target_system}")
    print(f"target_component={master.target_component}")
    print(f"flightmode={master.flightmode}")


if __name__ == "__main__":
    main()