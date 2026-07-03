import {
  faBaseball,
  faBasketball,
  faDumbbell,
  faFootball,
  faFutbol,
  faGolfBallTee,
  faMedal,
  faPersonRunning,
  faPersonSwimming,
  faTableTennisPaddleBall,
  faTrophy,
  faVolleyball,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const SPORT_ICONS: Record<string, IconDefinition> = {
  football: faFootball,
  baseball: faBaseball,
  softball: faBaseball,
  basketball: faBasketball,
  soccer: faFutbol,
  volleyball: faVolleyball,
  golf: faGolfBallTee,
  tennis: faTableTennisPaddleBall,
  track: faPersonRunning,
  cross_country: faPersonRunning,
  swimming: faPersonSwimming,
  wrestling: faDumbbell,
  cheer: faMedal,
  generic: faTrophy,
};

export default function SportIcon({
  icon,
  color,
  className = "h-6 w-6",
}: {
  icon: string | null | undefined;
  color?: string | null;
  className?: string;
}) {
  const sportIcon = SPORT_ICONS[icon || "generic"] || SPORT_ICONS.generic;

  return (
    <FontAwesomeIcon
      aria-hidden="true"
      className={className}
      icon={sportIcon}
      style={color ? { color } : undefined}
    />
  );
}
