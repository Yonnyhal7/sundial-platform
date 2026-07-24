const MAX_DEPLOYMENT_VERSION_LENGTH = 128;

export function getPwaDeploymentVersion() {
  const version =
    process.env.NEXT_PUBLIC_SUNDIAL_DEPLOYMENT_VERSION || null;

  return version?.trim().slice(0, MAX_DEPLOYMENT_VERSION_LENGTH) || null;
}
